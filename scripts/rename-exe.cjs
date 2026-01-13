const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const configPath = path.join(appRoot, "src-tauri", "tauri.conf.json");
const bundleDir = path.join(appRoot, "src-tauri", "target", "release", "bundle", "nsis");
const desiredBase = "Ender_Transfer";

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const version = config?.package?.version || "0.0.0";
const targetName = `${desiredBase}_${version}_x64_en-US.exe`;
const targetPath = path.join(bundleDir, targetName);

if (!fs.existsSync(bundleDir)) {
  process.exit(0);
}

const candidates = fs.readdirSync(bundleDir).filter((file) => file.toLowerCase().endsWith(".exe"));
if (!candidates.length) {
  process.exit(0);
}

const current = path.join(bundleDir, candidates[0]);
if (path.basename(current) === targetName) {
  process.exit(0);
}

if (fs.existsSync(targetPath)) {
  fs.unlinkSync(targetPath);
}

fs.renameSync(current, targetPath);
