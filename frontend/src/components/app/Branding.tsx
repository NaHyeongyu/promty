import { siGithub, type SimpleIcon } from "simple-icons";
import {
  BRAND_LOGO_BRIGHT_SRC,
  BRAND_LOGO_SRC,
  BRAND_NAME,
} from "../../config";
import { useTheme } from "../../theme";

function SimpleBrandIcon({
  icon,
  name,
}: {
  icon: SimpleIcon;
  name: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className="brand-icon"
      data-brand={name}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} />
    </svg>
  );
}

export function GitHubIcon() {
  return <SimpleBrandIcon icon={siGithub} name="github" />;
}

export function BrandLogo({ className = "" }: { className?: string }) {
  const { theme } = useTheme();
  const classNames = ["brand-logo", className].filter(Boolean).join(" ");

  return (
    <img
      alt=""
      aria-hidden="true"
      className={classNames}
      src={theme === "bright" ? BRAND_LOGO_BRIGHT_SRC : BRAND_LOGO_SRC}
    />
  );
}

export function BrandLockup() {
  return (
    <>
      <BrandLogo className="is-sidebar" />
      <strong>{BRAND_NAME}</strong>
    </>
  );
}
