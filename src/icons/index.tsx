import {
  FiArrowDown,
  FiArrowUp,
  FiBox,
  FiCalendar,
  FiDownload,
  FiEdit2,
  FiFile,
  FiFileText,
  FiFilm,
  FiFolder,
  FiHardDrive,
  FiHome,
  FiImage,
  FiMaximize2,
  FiMonitor,
  FiMusic,
  FiPlusCircle,
  FiCamera,
  FiTag,
  FiType,
} from "react-icons/fi";
import {
  BiColumns,
  BiGridAlt,
  BiGridSmall,
  BiListUl,
  BiTable,
} from "react-icons/bi";
import type { ViewMode, SortBy, SortOrder } from "../types";

export const IconLock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export const IconUnlock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 10V7a4 4 0 0 1 7.5-1" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export const IconStar = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 3.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17.6 6.6 20.3l1-6.1-4.4-4.3 6.1-.9L12 3.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconTrash = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconEdit = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 16.5V20h3.5l10-10-3.5-3.5-10 10zM14 6l3.5 3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6 9l6 6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const getPlaceIcon = (label: string) => {
  const normalized = label.trim().toLowerCase();
  if (normalized === "this pc") return <FiHardDrive />;
  if (normalized === "home") return <FiHome />;
  if (normalized === "desktop") return <FiMonitor />;
  if (normalized === "documents") return <FiFileText />;
  if (normalized === "downloads") return <FiDownload />;
  if (normalized === "pictures") return <FiImage />;
  if (normalized === "music") return <FiMusic />;
  if (normalized === "videos") return <FiFilm />;
  return <FiFolder />;
};

export const withViewIcon = (icon: JSX.Element, size = 16) => (
  <span className="view-icon" style={{ ["--view-icon-size" as any]: `${size}px` }}>
    {icon}
  </span>
);

export const getViewModeIcon = (mode: ViewMode) => {
  switch (mode) {
    case "details":
      return withViewIcon(<BiTable />);
    case "list":
      return withViewIcon(<BiListUl />);
    case "tiles":
      return withViewIcon(<BiGridAlt />);
    case "content":
      return withViewIcon(<BiColumns />);
    case "small-icons":
      return withViewIcon(<BiGridSmall />, 12);
    case "medium-icons":
      return withViewIcon(<BiGridSmall />, 18);
    case "large-icons":
      return withViewIcon(<BiGridSmall />, 26);
    case "extra-large-icons":
      return withViewIcon(<BiGridSmall />, 34);
    default:
      return withViewIcon(<BiTable />);
  }
};

export const getSortByIcon = (value: SortBy) => {
  switch (value) {
    case "name":
      return <FiType />;
    case "date":
      return <FiCalendar />;
    case "type":
      return <FiFile />;
    case "size":
      return <FiBox />;
    case "tags":
      return <FiTag />;
    case "date-created":
      return <FiPlusCircle />;
    case "date-modified":
      return <FiEdit2 />;
    case "date-taken":
      return <FiCamera />;
    case "dimensions":
      return <FiMaximize2 />;
    case "rating":
      return <IconStar />;
    default:
      return <FiType />;
  }
};

export const getSortOrderIcon = (value: SortOrder) => {
  if (value === "desc") return <FiArrowDown />;
  return <FiArrowUp />;
};

export const getEntryTypeIcon = ({
  isDir,
  isImage,
  isVideo,
}: {
  isDir: boolean;
  isImage: boolean;
  isVideo: boolean;
}) => {
  if (isDir) return <FiFolder />;
  if (isImage) return <FiImage />;
  if (isVideo) return <FiFilm />;
  return <FiFileText />;
};
