import {
  PanelLeft,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Settings,
  Plus,
  Check,
  Copy,
  ArrowUp,
  Square,
  Search,
  Link,
  Archive,
  EllipsisVertical,
  Clock,
  CircleCheck,
  Circle,
  CircleAlert,
  Sparkles,
  GitPullRequest,
  GitBranch,
  File,
  Pencil,
  SquareTerminal,
  Zap,
  Globe,
  Folder,
  Package,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Paintbrush,
  KeyRound,
  Keyboard,
  Database,
  RefreshCcw,
  Wrench,
  Lightbulb,
  AudioLines,
  X,
  type LucideProps,
} from "lucide-react";

type IconProps = LucideProps;

export const SidebarIcon = PanelLeft;
export const BackIcon = ChevronLeft;
export { ChevronDown as ChevronDownIcon };
export { ChevronUp as ChevronUpIcon };
export { ChevronRight as ChevronRightIcon };
export const SettingsIcon = Settings;
export const PlusIcon = Plus;
export const CheckIcon = Check;
export const CopyIcon = Copy;
export const SendIcon = ArrowUp;
export const StopIcon = Square;
export const SearchIcon = Search;
export const LinkIcon = Link;
export const ArchiveIcon = Archive;
export const MoreIcon = EllipsisVertical;
export const ClockIcon = Clock;
export const CheckCircleIcon = CircleCheck;
export const EmptyCircleIcon = Circle;
export const ErrorIcon = CircleAlert;
export const SparkleIcon = Sparkles;
export const GitPrIcon = GitPullRequest;
export const BranchIcon = GitBranch;
export const FileIcon = File;
export const PencilIcon = Pencil;
export const TerminalIcon = SquareTerminal;
export const BoltIcon = Zap;
export const GlobeIcon = Globe;
export const FolderIcon = Folder;
export const BoxIcon = Package;
export const RefreshIcon = RefreshCw;
export const SunIcon = Sun;
export const MoonIcon = Moon;
export const MonitorIcon = Monitor;
export const AppearanceIcon = Paintbrush;
export const KeyIcon = KeyRound;
export const KeyboardIcon = Keyboard;
export const DataControlsIcon = Database;
export const AutomationsIcon = RefreshCcw;
export const IntegrationsIcon = Wrench;
export const LightbulbIcon = Lightbulb;
export const AudioLinesIcon = AudioLines;
export const XIcon = X;

export function GitHubIcon({ className, ...props }: IconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"
      />
    </svg>
  );
}

export function RepoIcon({ className, ...props }: IconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 16 16" {...props}>
      <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
    </svg>
  );
}

export function InspectIcon({ className, ...props }: IconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 16 16" {...props}>
      <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
    </svg>
  );
}

export function ModelIcon({ className, ...props }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

export type { IconProps };
