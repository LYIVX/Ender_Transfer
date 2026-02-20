use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Cursor, Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use suppaftp::types::{FileType, Mode};
use suppaftp::{FtpError, FtpStream};
use tauri::{Manager, State, Window};
#[cfg(feature = "system-tray")]
use tauri::{CustomMenuItem, SystemTray, SystemTrayEvent, SystemTrayMenu};
use nom_exif::{EntryValue, Exif, ExifIter, ExifTag, MediaParser, MediaSource};
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use base64::Engine;
#[cfg(target_os = "windows")]
use windows::core::PCWSTR;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::SIZE;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::{
  CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, SelectObject, BITMAP,
  BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Shell::{
  IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_THUMBNAILONLY,
};
#[cfg(target_os = "windows")]
use winreg::enums::HKEY_CURRENT_USER;
#[cfg(target_os = "windows")]
use winreg::RegKey;

#[cfg(target_os = "windows")]
fn apply_window_icon(app: &tauri::App) {
  let icon_path = app
    .path_resolver()
    .resolve_resource("icons/icon.ico")
    .or_else(|| {
      let cwd = std::env::current_dir().ok()?;
      let candidates = [
        cwd.join("icons").join("icon.ico"),
        cwd.join("src-tauri").join("icons").join("icon.ico"),
        cwd.join("..").join("icons").join("icon.ico"),
        cwd.join("..").join("src-tauri").join("icons").join("icon.ico"),
      ];
      candidates.into_iter().find(|path| path.exists())
    });

  if let (Some(window), Some(path)) = (app.get_window("main"), icon_path) {
    let _ = window.set_icon(tauri::Icon::File(path));
  }
}

#[derive(Default)]
struct AppState {
  ftp: Mutex<Option<FtpStream>>,
  cwd: Mutex<String>,
  prefs: Mutex<UiPreferences>,
}

#[derive(Debug, Default, Serialize)]
struct UiPreferences {
  open_on_startup: bool,
  close_to_tray: bool,
  minimize_to_tray: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiPreferencesInput {
  open_on_startup: bool,
  close_to_tray: bool,
  minimize_to_tray: bool,
}

#[derive(Debug, Deserialize)]
struct ConnectConfig {
  host: String,
  port: u16,
  username: String,
  password: String,
}

#[derive(Debug, Serialize)]
struct ConnectResponse {
  cwd: String,
}

#[derive(Debug, Serialize)]
struct ListResponse {
  cwd: String,
  entries: Vec<FtpEntry>,
}

#[derive(Debug, Serialize)]
struct FtpEntry {
  name: String,
  size: Option<u64>,
  modified: Option<String>,
  is_dir: bool,
  raw: Option<String>,
}

#[derive(Debug, Serialize)]
struct LocalEntry {
  name: String,
  path: String,
  is_dir: bool,
  size: Option<u64>,
  modified: Option<i64>,
  created: Option<i64>,
  taken: Option<i64>,
  dimensions: Option<Dimensions>,
  rating: Option<u32>,
  tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
struct Dimensions {
  width: u32,
  height: u32,
}

#[derive(Debug, Serialize)]
struct LocalListResponse {
  path: String,
  entries: Vec<LocalEntry>,
}

#[derive(Clone, Debug, Serialize)]
struct LogEntry {
  level: String,
  message: String,
  timestamp: i64,
}

#[derive(Clone, Debug, Serialize)]
struct TransferProgress {
  id: String,
  transferred: u64,
  total: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
struct TransferDone {
  id: String,
}

#[derive(Clone, Debug, Serialize)]
struct TransferErrorPayload {
  id: String,
  message: String,
}

fn now_millis() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

fn system_time_millis(time: SystemTime) -> Option<i64> {
  time
    .duration_since(UNIX_EPOCH)
    .ok()
    .map(|d| d.as_millis() as i64)
}

fn parse_exif_datetime(value: &str) -> Option<i64> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return None;
  }
  let parsed = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y:%m:%d %H:%M:%S")
    .or_else(|_| chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S"))
    .ok()?;
  Some(parsed.and_utc().timestamp_millis())
}

fn decode_utf16(values: &[u16]) -> Option<String> {
  let cleaned: Vec<u16> = values.iter().copied().take_while(|v| *v != 0).collect();
  if cleaned.is_empty() {
    return None;
  }
  String::from_utf16(&cleaned).ok()
}

fn decode_bytes_utf16(bytes: &[u8]) -> Option<String> {
  if bytes.len() % 2 != 0 {
    return None;
  }
  let mut values = Vec::with_capacity(bytes.len() / 2);
  for chunk in bytes.chunks(2) {
    values.push(u16::from_le_bytes([chunk[0], chunk[1]]));
  }
  decode_utf16(&values)
}

fn entry_to_string(value: &EntryValue) -> Option<String> {
  match value {
    EntryValue::Text(text) => Some(text.clone()),
    EntryValue::NaiveDateTime(dt) => Some(dt.format("%Y:%m:%d %H:%M:%S").to_string()),
    EntryValue::Time(dt) => Some(dt.format("%Y:%m:%d %H:%M:%S").to_string()),
    EntryValue::U16Array(values) => decode_utf16(values),
    EntryValue::U8Array(values) => String::from_utf8(values.clone()).ok(),
    EntryValue::Undefined(values) => decode_bytes_utf16(values)
      .or_else(|| String::from_utf8(values.clone()).ok()),
    _ => None,
  }
}

fn entry_to_timestamp(value: &EntryValue) -> Option<i64> {
  match value {
    EntryValue::NaiveDateTime(dt) => Some(dt.and_utc().timestamp_millis()),
    EntryValue::Time(dt) => Some(dt.timestamp_millis()),
    _ => entry_to_string(value).and_then(|text| parse_exif_datetime(&text)),
  }
}

fn entry_to_u32(value: &EntryValue) -> Option<u32> {
  match value {
    EntryValue::U8(v) => Some(*v as u32),
    EntryValue::U16(v) => Some(*v as u32),
    EntryValue::U32(v) => Some(*v),
    EntryValue::U64(v) => Some(*v as u32),
    EntryValue::I8(v) => Some(*v as u32),
    EntryValue::I16(v) => Some(*v as u32),
    EntryValue::I32(v) => Some(*v as u32),
    EntryValue::I64(v) => Some(*v as u32),
    _ => entry_to_string(value).and_then(|text| parse_exif_rating(&text)),
  }
}

fn parse_exif_tags(value: &str) -> Vec<String> {
  value
    .split(|c| c == ';' || c == ',')
    .map(|item| item.trim().to_string())
    .filter(|item| !item.is_empty())
    .collect()
}

fn parse_exif_rating(value: &str) -> Option<u32> {
  let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
  if digits.is_empty() {
    None
  } else {
    digits.parse::<u32>().ok()
  }
}

fn normalize_cwd(cwd: String) -> String {
  let trimmed = cwd.trim().trim_matches('"');
  if trimmed.is_empty() {
    "/".to_string()
  } else {
    trimmed.to_string()
  }
}

fn log_event(window: &Window, level: &str, message: impl Into<String>) {
  let payload = LogEntry {
    level: level.to_string(),
    message: message.into(),
    timestamp: now_millis(),
  };
  let _ = window.emit("log", payload);
}

fn emit_progress(window: &Window, id: &str, transferred: u64, total: Option<u64>) {
  let payload = TransferProgress {
    id: id.to_string(),
    transferred,
    total,
  };
  let _ = window.emit("transfer-progress", payload);
}

fn emit_done(window: &Window, id: &str) {
  let _ = window.emit("transfer-complete", TransferDone { id: id.to_string() });
}

fn emit_error(window: &Window, id: &str, message: impl Into<String>) {
  let _ = window.emit(
    "transfer-error",
    TransferErrorPayload {
      id: id.to_string(),
      message: message.into(),
    },
  );
}

fn map_err<E: std::fmt::Display>(err: E) -> String {
  err.to_string()
}

#[cfg(target_os = "windows")]
fn set_autostart_windows(enable: bool) -> Result<(), String> {
  let hkcu = RegKey::predef(HKEY_CURRENT_USER);
  let (key, _) = hkcu
    .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
    .map_err(map_err)?;
  let app_name = "FTPBrowser";
  if enable {
    let exe = std::env::current_exe().map_err(map_err)?;
    let exe_str = exe.to_string_lossy().to_string();
    key.set_value(app_name, &exe_str).map_err(map_err)?;
  } else {
    let _ = key.delete_value(app_name);
  }
  Ok(())
}

fn set_autostart(enable: bool) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    return set_autostart_windows(enable);
  }
  #[cfg(not(target_os = "windows"))]
  {
    let _ = enable;
    return Ok(());
  }
}

fn normalize_line_name(name: String) -> String {
  let trimmed = name.trim();
  if trimmed == "." || trimmed == ".." {
    String::new()
  } else {
    trimmed.to_string()
  }
}

fn parse_list_entry(line: &str) -> Option<FtpEntry> {
  let trimmed = line.trim();
  if trimmed.is_empty() {
    return None;
  }

  let parts: Vec<&str> = trimmed.split_whitespace().collect();
  if parts.len() >= 4 && parts[0].contains('-') && parts[1].contains(':') {
    let is_dir = parts[2].eq_ignore_ascii_case("<DIR>");
    let size = if is_dir { None } else { parts[2].parse::<u64>().ok() };
    let name = normalize_line_name(parts[3..].join(" "));
    if name.is_empty() {
      return None;
    }
    return Some(FtpEntry {
      name,
      size,
      modified: Some(format!("{} {}", parts[0], parts[1])),
      is_dir,
      raw: Some(trimmed.to_string()),
    });
  }

  if parts.len() >= 9 {
    let marker = parts[0];
    let is_dir = marker.starts_with('d');
    let size = parts[4].parse::<u64>().ok();
    let modified = Some(format!("{} {} {}", parts[5], parts[6], parts[7]));
    let name = normalize_line_name(parts[8..].join(" "));
    if name.is_empty() {
      return None;
    }
    return Some(FtpEntry {
      name,
      size,
      modified,
      is_dir,
      raw: Some(trimmed.to_string()),
    });
  }

  Some(FtpEntry {
    name: trimmed.to_string(),
    size: None,
    modified: None,
    is_dir: false,
    raw: Some(trimmed.to_string()),
  })
}

fn parse_list_entries(lines: Vec<String>) -> Vec<FtpEntry> {
  lines
    .into_iter()
    .filter_map(|line| parse_list_entry(&line))
    .collect()
}

fn connect_with_timeout(host: &str, port: u16, timeout: Duration) -> Result<FtpStream, String> {
  let addrs: Vec<SocketAddr> = (host, port)
    .to_socket_addrs()
    .map_err(map_err)?
    .collect();
  if addrs.is_empty() {
    return Err(format!("Unable to resolve address: {}:{}", host, port));
  }

  let mut last_err: Option<String> = None;
  let mut ordered = addrs;
  ordered.sort_by_key(|addr| if addr.is_ipv4() { 0 } else { 1 });

  for addr in ordered {
    match TcpStream::connect_timeout(&addr, timeout) {
      Ok(stream) => {
        stream
          .set_read_timeout(Some(timeout))
          .map_err(map_err)?;
        stream
          .set_write_timeout(Some(timeout))
          .map_err(map_err)?;
        let _ = stream.set_nodelay(true);
        return FtpStream::connect_with_stream(stream).map_err(map_err);
      }
      Err(err) => last_err = Some(map_err(err)),
    }
  }

  Err(last_err.unwrap_or_else(|| "Failed to connect".to_string()))
}

#[tauri::command]
fn connect(
  state: State<'_, AppState>,
  window: Window,
  config: ConnectConfig,
) -> Result<ConnectResponse, String> {
  let host = config.host.trim();
  let address = format!("{}:{}", host, config.port);
  log_event(&window, "info", format!("Connecting to {}", address));
  let mut ftp = connect_with_timeout(host, config.port, Duration::from_secs(10))?;
  ftp
    .login(&config.username, &config.password)
    .map_err(map_err)?;
  ftp.set_passive_nat_workaround(true);
  ftp.transfer_type(FileType::Binary).map_err(map_err)?;
  let cwd = normalize_cwd(ftp.pwd().map_err(map_err)?);
  *state.cwd.lock().map_err(map_err)? = cwd.clone();
  *state.ftp.lock().map_err(map_err)? = Some(ftp);
  log_event(&window, "success", "Connected");
  Ok(ConnectResponse { cwd })
}

#[tauri::command]
fn disconnect(state: State<'_, AppState>, window: Window) -> Result<(), String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  if let Some(mut ftp) = ftp_guard.take() {
    let _ = ftp.quit();
  }
  *state.cwd.lock().map_err(map_err)? = String::new();
  log_event(&window, "info", "Disconnected");
  Ok(())
}

#[tauri::command]
fn list_dir(
  state: State<'_, AppState>,
  window: Window,
  path: Option<String>,
) -> Result<ListResponse, String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;
  if let Some(target) = path {
    if !target.trim().is_empty() {
      ftp.cwd(target).map_err(map_err)?;
    }
  }
  let cwd = normalize_cwd(ftp.pwd().map_err(map_err)?);
  *state.cwd.lock().map_err(map_err)? = cwd.clone();
  let listing = ftp.list(None).map_err(map_err)?;
  let entries = parse_list_entries(listing);
  log_event(&window, "info", format!("Listed {} items", entries.len()));
  Ok(ListResponse { cwd, entries })
}

#[tauri::command]
fn create_dir(state: State<'_, AppState>, window: Window, path: String) -> Result<(), String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;
  ftp.mkdir(path).map_err(map_err)?;
  log_event(&window, "success", "Directory created");
  Ok(())
}

#[tauri::command]
fn create_remote_file(state: State<'_, AppState>, window: Window, path: String) -> Result<(), String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;
  let mut reader = Cursor::new(Vec::<u8>::new());
  ftp.put_file(path, &mut reader).map_err(map_err)?;
  log_event(&window, "success", "Remote file created");
  Ok(())
}

fn join_remote(base: &str, name: &str) -> String {
  if base.ends_with('/') {
    format!("{}{}", base, name)
  } else {
    format!("{}/{}", base, name)
  }
}

fn copy_remote_file(ftp: &mut FtpStream, from: &str, to: &str) -> Result<(), String> {
  let mut data: Vec<u8> = Vec::new();
  ftp
    .retr(from, |reader| {
      reader
        .read_to_end(&mut data)
        .map(|_| ())
        .map_err(FtpError::ConnectionError)
    })
    .map_err(map_err)?;
  let mut cursor = Cursor::new(data);
  ftp.put_file(to.to_string(), &mut cursor).map_err(map_err)?;
  Ok(())
}

fn copy_remote_dir(ftp: &mut FtpStream, from: &str, to: &str) -> Result<(), String> {
  let _ = ftp.mkdir(to);
  let listing = ftp.list(Some(from)).map_err(map_err)?;
  let entries = parse_list_entries(listing);
  for entry in entries {
    if entry.name == "." || entry.name == ".." {
      continue;
    }
    let from_path = join_remote(from, &entry.name);
    let to_path = join_remote(to, &entry.name);
    if entry.is_dir {
      copy_remote_dir(ftp, &from_path, &to_path)?;
    } else {
      copy_remote_file(ftp, &from_path, &to_path)?;
    }
  }
  Ok(())
}

#[tauri::command]
fn copy_remote(
  state: State<'_, AppState>,
  window: Window,
  from: String,
  to: String,
  is_dir: bool,
) -> Result<(), String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;
  if is_dir {
    copy_remote_dir(ftp, &from, &to)?;
  } else {
    copy_remote_file(ftp, &from, &to)?;
  }
  log_event(&window, "success", "Remote copy completed");
  Ok(())
}

fn delete_remote_dir(ftp: &mut FtpStream, path: &str) -> Result<(), String> {
  let listing = ftp.list(Some(path)).map_err(map_err)?;
  let entries = parse_list_entries(listing);
  for entry in entries {
    if entry.name == "." || entry.name == ".." {
      continue;
    }
    let child = join_remote(path, &entry.name);
    if entry.is_dir {
      delete_remote_dir(ftp, &child)?;
    } else {
      ftp.rm(child).map_err(map_err)?;
    }
  }
  ftp.rmdir(path).map_err(map_err)?;
  Ok(())
}

#[tauri::command]
fn delete_path(
  state: State<'_, AppState>,
  window: Window,
  path: String,
  is_dir: bool,
) -> Result<(), String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;
  if is_dir {
    delete_remote_dir(ftp, &path)?;
  } else {
    ftp.rm(path).map_err(map_err)?;
  }
  log_event(&window, "success", "Remote item removed");
  Ok(())
}

#[tauri::command]
fn rename_path(
  state: State<'_, AppState>,
  window: Window,
  from: String,
  to: String,
) -> Result<(), String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;
  ftp.rename(from, to).map_err(map_err)?;
  log_event(&window, "success", "Remote item renamed");
  Ok(())
}

fn copy_with_progress(
  reader: &mut dyn Read,
  writer: &mut dyn Write,
  window: &Window,
  id: &str,
  total: Option<u64>,
) -> Result<u64, FtpError> {
  let mut buffer = [0u8; 128 * 1024];
  let mut transferred = 0u64;
  let mut last_emit = 0u64;
  let mut last_tick = Instant::now();

  loop {
    let read = reader.read(&mut buffer).map_err(FtpError::ConnectionError)?;
    if read == 0 {
      break;
    }
    writer
      .write_all(&buffer[..read])
      .map_err(FtpError::ConnectionError)?;
    transferred += read as u64;

    if transferred - last_emit >= 512 * 1024 || last_tick.elapsed() > Duration::from_millis(500) {
      emit_progress(window, id, transferred, total);
      last_emit = transferred;
      last_tick = Instant::now();
    }
  }

  emit_progress(window, id, transferred, total);
  Ok(transferred)
}

struct ProgressReader<R> {
  inner: R,
  window: Window,
  id: String,
  total: Option<u64>,
  transferred: u64,
  last_emit: u64,
  last_tick: Instant,
}

impl<R> ProgressReader<R> {
  fn new(inner: R, window: Window, id: String, total: Option<u64>) -> Self {
    Self {
      inner,
      window,
      id,
      total,
      transferred: 0,
      last_emit: 0,
      last_tick: Instant::now(),
    }
  }
}

impl<R: Read> Read for ProgressReader<R> {
  fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
    let read = self.inner.read(buf)?;
    if read > 0 {
      self.transferred += read as u64;
      if self.transferred - self.last_emit >= 512 * 1024
        || self.last_tick.elapsed() > Duration::from_millis(500)
      {
        emit_progress(&self.window, &self.id, self.transferred, self.total);
        self.last_emit = self.transferred;
        self.last_tick = Instant::now();
      }
    }
    Ok(read)
  }
}

#[tauri::command]
fn download_file(
  state: State<'_, AppState>,
  window: Window,
  id: String,
  remote_path: String,
  local_path: String,
) -> Result<(), String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;

  let total = ftp.size(&remote_path).ok().map(|value| value as u64);
  let target = Path::new(&local_path);
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(map_err)?;
  }
  let file = File::create(&local_path).map_err(map_err)?;
  let mut writer = BufWriter::with_capacity(256 * 1024, file);
  let window_clone = window.clone();
  let id_clone = id.clone();

  match ftp.retr(&remote_path, |reader| {
    let result = copy_with_progress(reader, &mut writer, &window_clone, &id_clone, total);
    writer.flush().map_err(FtpError::ConnectionError)?;
    result
  }) {
    Ok(_) => {
      emit_done(&window, &id);
      log_event(&window, "success", format!("Downloaded {}", remote_path));
      Ok(())
    }
    Err(err) => {
      emit_error(&window, &id, err.to_string());
      Err(map_err(err))
    }
  }
}

#[tauri::command]
fn upload_file(
  state: State<'_, AppState>,
  window: Window,
  id: String,
  local_path: String,
  remote_path: String,
) -> Result<(), String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;

  let should_retry_with_epsv = |err: &FtpError| match err {
    FtpError::ConnectionError(io_err) => {
      io_err.kind() == std::io::ErrorKind::TimedOut
        || io_err.raw_os_error() == Some(10060)
    }
    FtpError::UnexpectedResponse(response) => response.status.code() == 425,
    _ => false,
  };

  let mut attempt_upload = |mode: Mode| -> Result<(), FtpError> {
    ftp.set_mode(mode);
    let file = File::open(&local_path).map_err(FtpError::ConnectionError)?;
    let total = file.metadata().map(|m| m.len()).ok();
    let buf_file = BufReader::with_capacity(256 * 1024, file);
    let reader = ProgressReader::new(buf_file, window.clone(), id.clone(), total);
    let mut reader = reader;
    ftp.put_file(remote_path.clone(), &mut reader).map(|_| ())
  };

  let result = match attempt_upload(Mode::Passive) {
    Ok(_) => Ok(()),
    Err(err) => {
      if should_retry_with_epsv(&err) {
        log_event(
          &window,
          "info",
          "Upload retry using EPSV (extended passive)".to_string(),
        );
        attempt_upload(Mode::ExtendedPassive)
      } else {
        Err(err)
      }
    }
  };

  ftp.set_mode(Mode::Passive);

  match result {
    Ok(_) => {
      emit_done(&window, &id);
      log_event(&window, "success", format!("Uploaded {}", local_path));
      Ok(())
    }
    Err(err) => {
      emit_error(&window, &id, err.to_string());
      Err(map_err(err))
    }
  }
}

#[tauri::command]
fn list_local(path: String) -> Result<LocalListResponse, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("this_pc") {
    let mut entries = Vec::new();
    for letter in b'A'..=b'Z' {
      let drive = format!("{}:\\", letter as char);
      if Path::new(&drive).exists() {
    entries.push(LocalEntry {
      name: format!("{}:", letter as char),
      path: drive,
      is_dir: true,
      size: None,
      modified: None,
      created: None,
      taken: None,
      dimensions: None,
      rating: None,
      tags: None,
    });
      }
    }
    return Ok(LocalListResponse {
      path: "this_pc".to_string(),
      entries,
    });
  }

  let mut entries = Vec::new();
  let read_dir = fs::read_dir(&path).map_err(map_err)?;

  for entry in read_dir {
    let entry = entry.map_err(map_err)?;
    let metadata = entry.metadata().map_err(map_err)?;
    let is_dir = metadata.is_dir();
    let size = if metadata.is_file() {
      Some(metadata.len())
    } else {
      None
    };
    let modified = metadata.modified().ok().and_then(system_time_millis);
    let created = metadata.created().ok().and_then(system_time_millis);
    let mut taken = None;
    let mut dimensions = None;
    let mut rating = None;
    let mut tags: Option<Vec<String>> = None;

    if metadata.is_file() {
      if let Ok((width, height)) = image::image_dimensions(entry.path()) {
        dimensions = Some(Dimensions { width, height });
      }

      let mut parser = MediaParser::new();
      if let Ok(ms) = MediaSource::file_path(entry.path()) {
        if ms.has_exif() {
          if let Ok(iter) = parser.parse::<_, _, ExifIter>(ms) {
            let exif: Exif = iter.into();
            if taken.is_none() {
              taken = exif
                .get(ExifTag::DateTimeOriginal)
                .and_then(entry_to_timestamp)
                .or_else(|| {
                  exif
                    .get(ExifTag::CreateDate)
                    .and_then(entry_to_timestamp)
                })
                .or_else(|| {
                  exif
                    .get(ExifTag::ModifyDate)
                    .and_then(entry_to_timestamp)
                });
            }

            const TAG_XPKEYWORDS: u16 = 0x9C9E;
            const TAG_XPSUBJECT: u16 = 0x9C9F;
            const TAG_RATING: u16 = 0x4746;
            const TAG_RATING_PERCENT: u16 = 0x4749;

            if rating.is_none() {
              rating = exif
                .get_by_ifd_tag_code(0, TAG_RATING)
                .and_then(entry_to_u32)
                .or_else(|| {
                  exif
                    .get_by_ifd_tag_code(0, TAG_RATING_PERCENT)
                    .and_then(entry_to_u32)
                });
            }

            let mut tag_list = Vec::new();
            if let Some(value) = exif
              .get_by_ifd_tag_code(0, TAG_XPKEYWORDS)
              .and_then(entry_to_string)
            {
              tag_list.extend(parse_exif_tags(&value));
            }
            if let Some(value) = exif
              .get_by_ifd_tag_code(0, TAG_XPSUBJECT)
              .and_then(entry_to_string)
            {
              tag_list.extend(parse_exif_tags(&value));
            }
            if !tag_list.is_empty() {
              tag_list.sort();
              tag_list.dedup();
              tags = Some(tag_list);
            }
          }
        }
      }
    }

    let name = entry.file_name().to_string_lossy().to_string();
    let path = entry.path().to_string_lossy().to_string();

    entries.push(LocalEntry {
      name,
      path,
      is_dir,
      size,
      modified,
      created,
      taken,
      dimensions,
      rating,
      tags,
    });
  }

  Ok(LocalListResponse { path, entries })
}

#[tauri::command]
fn create_local_dir(path: String) -> Result<(), String> {
  fs::create_dir_all(path).map_err(map_err)?;
  Ok(())
}

#[tauri::command]
fn create_local_file(path: String) -> Result<(), String> {
  if let Some(parent) = Path::new(&path).parent() {
    fs::create_dir_all(parent).map_err(map_err)?;
  }
  File::create(path).map_err(map_err)?;
  Ok(())
}

fn copy_dir_all(from: &Path, to: &Path) -> Result<(), String> {
  fs::create_dir_all(to).map_err(map_err)?;
  for entry in fs::read_dir(from).map_err(map_err)? {
    let entry = entry.map_err(map_err)?;
    let path = entry.path();
    let target = to.join(entry.file_name());
    if path.is_dir() {
      copy_dir_all(&path, &target)?;
    } else {
      fs::copy(&path, &target).map_err(map_err)?;
    }
  }
  Ok(())
}

#[tauri::command]
fn copy_local(from: String, to: String) -> Result<(), String> {
  let from_path = Path::new(&from);
  let to_path = Path::new(&to);
  if from_path.is_dir() {
    copy_dir_all(from_path, to_path)?;
  } else {
    if let Some(parent) = to_path.parent() {
      fs::create_dir_all(parent).map_err(map_err)?;
    }
    fs::copy(from_path, to_path).map_err(map_err)?;
  }
  Ok(())
}

#[tauri::command]
fn delete_local(path: String, is_dir: bool) -> Result<(), String> {
  if is_dir {
    fs::remove_dir_all(path).map_err(map_err)?;
  } else {
    fs::remove_file(path).map_err(map_err)?;
  }
  Ok(())
}

#[tauri::command]
fn rename_local(from: String, to: String) -> Result<(), String> {
  fs::rename(from, to).map_err(map_err)?;
  Ok(())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
  Path::new(&path).exists()
}

#[tauri::command]
fn launch_path(path: String) -> Result<(), String> {
  let target = Path::new(&path);
  if !target.exists() {
    return Err("File not found.".to_string());
  }
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("cmd")
      .args(["/C", "start", "", &path])
      .creation_flags(0x08000000) // CREATE_NO_WINDOW
      .spawn()
      .map_err(map_err)?;
    return Ok(());
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&path)
      .spawn()
      .map_err(map_err)?;
    return Ok(());
  }
  #[cfg(target_os = "linux")]
  {
    std::process::Command::new("xdg-open")
      .arg(&path)
      .spawn()
      .map_err(map_err)?;
    return Ok(());
  }
  #[allow(unreachable_code)]
  Err("Unsupported platform.".to_string())
}

#[tauri::command]
fn open_with_dialog(path: String) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("rundll32.exe")
      .args(["shell32.dll,OpenAs_RunDLL", &path])
      .spawn()
      .map_err(map_err)?;
    Ok(())
  }
  #[cfg(not(target_os = "windows"))]
  {
    let _ = path;
    Err("Open with dialog is only supported on Windows.".to_string())
  }
}

#[tauri::command]
fn open_properties(path: String) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    if !Path::new(&path).exists() {
      return Err("File not found.".to_string());
    }
    let parent = Path::new(&path)
      .parent()
      .and_then(|value| value.to_str())
      .unwrap_or("")
      .replace("'", "''");
    let name = Path::new(&path)
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or("")
      .replace("'", "''");
    let command = format!(
      "$shell = New-Object -ComObject Shell.Application; $folder = $shell.Namespace('{}'); $item = $folder.ParseName('{}'); $item.InvokeVerb('Properties');",
      parent, name
    );
    std::process::Command::new("powershell")
      .args(["-NoProfile", "-Command", &command])
      .spawn()
      .map_err(map_err)?;
    Ok(())
  }
  #[cfg(not(target_os = "windows"))]
  {
    let _ = path;
    Err("Properties dialog is only supported on Windows.".to_string())
  }
}

#[tauri::command]
fn get_env(key: String) -> Option<String> {
  std::env::var(key).ok()
}

#[tauri::command]
fn is_local_dir(path: String) -> bool {
  Path::new(&path).is_dir()
}

fn mime_from_path(path: &str) -> &'static str {
  let lower = path.to_ascii_lowercase();
  if lower.ends_with(".png") {
    "image/png"
  } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
    "image/jpeg"
  } else if lower.ends_with(".gif") {
    "image/gif"
  } else if lower.ends_with(".bmp") {
    "image/bmp"
  } else if lower.ends_with(".webp") {
    "image/webp"
  } else if lower.ends_with(".tif") || lower.ends_with(".tiff") {
    "image/tiff"
  } else if lower.ends_with(".mp4") {
    "video/mp4"
  } else if lower.ends_with(".m4v") {
    "video/mp4"
  } else if lower.ends_with(".mov") {
    "video/quicktime"
  } else if lower.ends_with(".webm") {
    "video/webm"
  } else if lower.ends_with(".mkv") {
    "video/x-matroska"
  } else if lower.ends_with(".avi") {
    "video/x-msvideo"
  } else {
    "application/octet-stream"
  }
}

#[tauri::command]
fn read_local_image_data(path: String) -> Result<String, String> {
  let mut file = File::open(&path).map_err(map_err)?;
  let mut buf = Vec::new();
  file.read_to_end(&mut buf).map_err(map_err)?;
  let mime = mime_from_path(&path);
  let encoded = BASE64_ENGINE.encode(buf);
  Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
fn read_local_image_thumb(path: String, max_size: u32) -> Result<String, String> {
  let img = image::open(&path).map_err(map_err)?;
  let resized = img.resize(max_size, max_size, image::imageops::FilterType::Triangle);
  let mut out = Vec::new();
  let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 75);
  encoder.encode_image(&resized).map_err(map_err)?;
  let encoded = BASE64_ENGINE.encode(out);
  Ok(format!("data:image/jpeg;base64,{}", encoded))
}

#[tauri::command]
fn read_local_video_data(path: String, max_bytes: u64) -> Result<String, String> {
  let metadata = fs::metadata(&path).map_err(map_err)?;
  if metadata.len() > max_bytes {
    return Err("too_large".to_string());
  }
  let mut file = File::open(&path).map_err(map_err)?;
  let mut buf = Vec::new();
  file.read_to_end(&mut buf).map_err(map_err)?;
  let mime = mime_from_path(&path);
  let encoded = BASE64_ENGINE.encode(buf);
  Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
fn read_local_video_thumb(_window: Window, path: String, max_size: u32) -> Result<String, String> {
  #[cfg(target_os = "windows")]
  {
    return read_shell_thumbnail(&path, max_size);
  }
  #[cfg(not(target_os = "windows"))]
  {
    let _ = path;
    let _ = max_size;
    return Err("unsupported_platform".to_string());
  }
}

#[cfg(target_os = "windows")]
fn read_shell_thumbnail(path: &str, max_size: u32) -> Result<String, String> {
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok();
  }

  let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
  let size = SIZE {
    cx: max_size as i32,
    cy: max_size as i32,
  };

  let factory: IShellItemImageFactory = unsafe {
    SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).map_err(map_err)?
  };

  let flags = SIIGBF_THUMBNAILONLY | SIIGBF_BIGGERSIZEOK;
  let hbitmap = unsafe { factory.GetImage(size, flags).map_err(map_err)? };

  let mut bmp = BITMAP::default();
  let res = unsafe {
    GetObjectW(
      hbitmap,
      std::mem::size_of::<BITMAP>() as i32,
      Some(&mut bmp as *mut _ as *mut _),
    )
  };
  if res == 0 {
    unsafe { DeleteObject(hbitmap) };
    unsafe { CoUninitialize() };
    return Err("bitmap_failed".to_string());
  }

  let width = bmp.bmWidth.max(1) as i32;
  let height = bmp.bmHeight.max(1) as i32;

  let mut bmi = BITMAPINFO {
    bmiHeader: BITMAPINFOHEADER {
      biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
      biWidth: width,
      biHeight: -height,
      biPlanes: 1,
      biBitCount: 32,
      biCompression: BI_RGB.0 as u32,
      biSizeImage: 0,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    },
    bmiColors: [Default::default()],
  };

  let mut buf = vec![0u8; (width * height * 4) as usize];
  let hdc = unsafe { CreateCompatibleDC(None) };
  if hdc.0 == 0 {
    unsafe { DeleteObject(hbitmap) };
    unsafe { CoUninitialize() };
    return Err("dc_failed".to_string());
  }
  let _old = unsafe { SelectObject(hdc, hbitmap) };
  let scan = unsafe {
    GetDIBits(
      hdc,
      hbitmap,
      0,
      height as u32,
      Some(buf.as_mut_ptr() as *mut _),
      &mut bmi,
      DIB_RGB_COLORS,
    )
  };
  unsafe { DeleteDC(hdc) };
  unsafe { DeleteObject(hbitmap) };
  unsafe { CoUninitialize() };

  if scan == 0 {
    return Err("dibits_failed".to_string());
  }

  let mut rgba = Vec::with_capacity(buf.len());
  for chunk in buf.chunks(4) {
    rgba.push(chunk[2]);
    rgba.push(chunk[1]);
    rgba.push(chunk[0]);
    rgba.push(255);
  }

  let image = image::RgbaImage::from_raw(width as u32, height as u32, rgba)
    .ok_or("image_failed".to_string())?;
  let mut out = Vec::new();
  let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 75);
  encoder.encode_image(&image).map_err(map_err)?;
  let encoded = BASE64_ENGINE.encode(out);
  Ok(format!("data:image/jpeg;base64,{}", encoded))
}

#[tauri::command]
fn update_preferences(state: State<'_, AppState>, prefs: UiPreferencesInput) -> Result<(), String> {
  let mut guard = state.prefs.lock().map_err(map_err)?;
  guard.open_on_startup = prefs.open_on_startup;
  guard.close_to_tray = prefs.close_to_tray;
  guard.minimize_to_tray = prefs.minimize_to_tray;
  set_autostart(prefs.open_on_startup)?;
  Ok(())
}

/* ── Recursive file listing for folder transfers ── */

#[derive(Serialize)]
struct RecursiveEntry {
  relative_path: String,
  is_dir: bool,
  size: Option<u64>,
}

#[tauri::command]
fn list_local_files_recursive(root: String) -> Result<Vec<RecursiveEntry>, String> {
  let root_path = Path::new(&root);
  if !root_path.is_dir() {
    return Err("Path is not a directory".to_string());
  }
  let mut results = Vec::new();
  fn walk(dir: &Path, base: &Path, out: &mut Vec<RecursiveEntry>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(map_err)?;
    for entry in entries {
      let entry = entry.map_err(map_err)?;
      let path = entry.path();
      let rel = path.strip_prefix(base).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
      let meta = entry.metadata().map_err(map_err)?;
      if meta.is_dir() {
        out.push(RecursiveEntry { relative_path: rel.clone(), is_dir: true, size: None });
        walk(&path, base, out)?;
      } else {
        out.push(RecursiveEntry { relative_path: rel, is_dir: false, size: Some(meta.len()) });
      }
    }
    Ok(())
  }
  walk(root_path, root_path, &mut results)?;
  Ok(results)
}

#[tauri::command]
fn list_remote_files_recursive(
  state: State<'_, AppState>,
  path: String,
) -> Result<Vec<RecursiveEntry>, String> {
  let mut ftp_guard = state.ftp.lock().map_err(map_err)?;
  let ftp = ftp_guard.as_mut().ok_or("Not connected")?;
  let mut results = Vec::new();
  fn walk(ftp: &mut FtpStream, dir: &str, base: &str, out: &mut Vec<RecursiveEntry>) -> Result<(), String> {
    let listing = ftp.list(Some(dir)).map_err(map_err)?;
    let entries = parse_list_entries(listing);
    for entry in entries {
      if entry.name == "." || entry.name == ".." { continue; }
      let full = join_remote(dir, &entry.name);
      let rel = if base.ends_with('/') {
        full.strip_prefix(base).unwrap_or(&full).to_string()
      } else {
        full.strip_prefix(&format!("{}/", base)).unwrap_or(&full).to_string()
      };
      if entry.is_dir {
        out.push(RecursiveEntry { relative_path: rel.clone(), is_dir: true, size: None });
        walk(ftp, &full, base, out)?;
      } else {
        out.push(RecursiveEntry { relative_path: rel, is_dir: false, size: entry.size });
      }
    }
    Ok(())
  }
  walk(ftp, &path, &path, &mut results)?;
  Ok(results)
}

fn main() {
  let builder = tauri::Builder::default()
    .manage(AppState::default())
    .setup(|app| {
      #[cfg(target_os = "windows")]
      apply_window_icon(app);
      if cfg!(debug_assertions) {
        if let Some(window) = app.get_window("main") {
          let _ = window.eval("window.location.replace('http://localhost:1420/');");
        }
      }
      Ok(())
    });
  let builder = if cfg!(debug_assertions) {
    builder
  } else {
    builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
  };

  #[cfg(feature = "system-tray")]
  let builder = builder
    .system_tray(
      SystemTray::new().with_menu(
        SystemTrayMenu::new()
          .add_item(CustomMenuItem::new("show", "Show"))
          .add_item(CustomMenuItem::new("quit", "Quit")),
      ),
    )
    .on_system_tray_event(|app, event| {
      match event {
        SystemTrayEvent::MenuItemClick { id, .. } => {
          match id.as_str() {
            "show" => {
              if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
              }
            }
            "quit" => {
              std::process::exit(0);
            }
            _ => {}
          }
        }
        SystemTrayEvent::LeftClick { .. } | SystemTrayEvent::DoubleClick { .. } => {
          if let Some(window) = app.get_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
          }
        }
        _ => {}
      }
    });

  let builder = builder.on_window_event(|event| {
    let window = event.window();
    if window.label() != "main" {
      return;
    }
    if let Some(state) = window.try_state::<AppState>() {
      if let Ok(prefs) = state.prefs.lock() {
        match event.event() {
          #[cfg(feature = "system-tray")]
          tauri::WindowEvent::CloseRequested { api, .. } => {
            if prefs.close_to_tray {
              let _ = window.hide();
              api.prevent_close();
            }
          }
          #[cfg(not(feature = "system-tray"))]
          tauri::WindowEvent::CloseRequested { .. } => {}
          tauri::WindowEvent::Resized(_) => {
            if prefs.minimize_to_tray {
              #[cfg(feature = "system-tray")]
              {
                if let Ok(true) = window.is_minimized() {
                  let _ = window.hide();
                }
              }
            }
          }
          _ => {}
        }
      }
    }
  });

  builder
    .invoke_handler(tauri::generate_handler![
      connect,
      disconnect,
      list_dir,
      create_dir,
      delete_path,
      rename_path,
      download_file,
      upload_file,
      list_local,
      create_local_dir,
      create_local_file,
      copy_local,
      delete_local,
      rename_local,
      path_exists,
      launch_path,
      open_with_dialog,
      open_properties,
      get_env,
      is_local_dir,
      read_local_image_data,
      read_local_image_thumb,
      read_local_video_data,
      read_local_video_thumb,
      copy_remote,
      create_remote_file,
      update_preferences,
      list_local_files_recursive,
      list_remote_files_recursive
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
