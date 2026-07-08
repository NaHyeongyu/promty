import {
  Bot,
  Database,
  Folder,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Terminal,
  User,
} from "lucide-react";
import type { AuthUser } from "../../workspace/types";
import { GitHubIcon } from "./Branding";

export function UserProfilePage({
  connectedRepositoryCount,
  currentUser,
  latestActivityLabel,
  onLogout,
  projectCount,
}: {
  connectedRepositoryCount: number;
  currentUser: AuthUser | null;
  latestActivityLabel: string;
  onLogout: () => void;
  projectCount: number;
}) {
  const displayName = currentUser?.username ?? "Signed in";
  const email = currentUser?.email ?? "GitHub authenticated";
  const roleLabel = currentUser?.is_admin ? "Admin" : "Member";
  const userInitial = displayName.trim().charAt(0).toUpperCase() || "P";
  const userId = currentUser?.id ?? "Not available";

  return (
    <section className="profile-page" aria-label="Profile settings">
      <section className="profile-hero" aria-labelledby="profile-title">
        <div className="profile-avatar profile-avatar-large" aria-hidden="true">
          {currentUser?.avatar_url ? (
            <img alt="" src={currentUser.avatar_url} />
          ) : (
            <span>{userInitial}</span>
          )}
        </div>
        <div className="profile-hero-copy">
          <span>GitHub account</span>
          <h2 id="profile-title">{displayName}</h2>
          <p>{email}</p>
          <div className="profile-pill-row" aria-label="Account status">
            <span className="profile-pill" data-tone="success">
              Active session
            </span>
            <span className="profile-pill">{roleLabel}</span>
          </div>
        </div>
      </section>

      <div className="profile-grid">
        <section className="profile-section" aria-labelledby="profile-account-title">
          <div className="profile-section-header">
            <User aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="profile-account-title">Account</h3>
              <p>Identity used across this workspace.</p>
            </div>
          </div>
          <dl className="profile-setting-list">
            <div className="profile-setting-row">
              <dt>Display name</dt>
              <dd>{displayName}</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Email</dt>
              <dd>{email}</dd>
            </div>
            <div className="profile-setting-row">
              <dt>User ID</dt>
              <dd>
                <code>{userId}</code>
              </dd>
            </div>
            <div className="profile-setting-row">
              <dt>Workspace projects</dt>
              <dd>{projectCount.toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <section className="profile-section" aria-labelledby="profile-preferences-title">
          <div className="profile-section-header">
            <Settings aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="profile-preferences-title">Preferences</h3>
              <p>Defaults for how the workspace opens.</p>
            </div>
          </div>
          <dl className="profile-setting-list">
            <div className="profile-setting-row">
              <dt>Default model</dt>
              <dd>Auto-detect</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Theme</dt>
              <dd>System dark</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Language</dt>
              <dd>English</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Timezone</dt>
              <dd>Browser default</dd>
            </div>
          </dl>
        </section>

        <section
          className="profile-section"
          aria-labelledby="profile-connections-title"
        >
          <div className="profile-section-header">
            <GitHubIcon />
            <div>
              <h3 id="profile-connections-title">Connected Accounts</h3>
              <p>External accounts available to Promty.</p>
            </div>
          </div>
          <dl className="profile-setting-list">
            <div className="profile-setting-row">
              <dt>GitHub</dt>
              <dd>Connected</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Repository access</dt>
              <dd>Project-level</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Connected repositories</dt>
              <dd>
                {connectedRepositoryCount.toLocaleString()} /{" "}
                {projectCount.toLocaleString()}
              </dd>
            </div>
            <div className="profile-setting-row">
              <dt>Latest workspace activity</dt>
              <dd>{latestActivityLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="profile-section" aria-labelledby="profile-security-title">
          <div className="profile-section-header">
            <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="profile-security-title">Security</h3>
              <p>Session and access controls.</p>
            </div>
          </div>
          <dl className="profile-setting-list">
            <div className="profile-setting-row">
              <dt>Current session</dt>
              <dd>Active</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Authentication</dt>
              <dd>GitHub OAuth</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Workspace role</dt>
              <dd>{roleLabel}</dd>
            </div>
          </dl>
          <div className="profile-section-actions">
            <button className="toolbar-button" onClick={onLogout} type="button">
              <LogOut aria-hidden="true" size={15} strokeWidth={1.5} />
              <span>Log out</span>
            </button>
          </div>
        </section>

        <section
          className="profile-section profile-section-wide"
          aria-labelledby="profile-privacy-title"
        >
          <div className="profile-section-header">
            <Database aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="profile-privacy-title">Data & Privacy</h3>
              <p>What Promty stores for this account.</p>
            </div>
          </div>
          <dl className="profile-setting-list profile-setting-list-compact">
            <div className="profile-setting-row">
              <dt>Project activity</dt>
              <dd>Prompts, sessions, file changes</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Memory artifacts</dt>
              <dd>Generated from synced project activity</dd>
            </div>
            <div className="profile-setting-row">
              <dt>Data export</dt>
              <dd>Not configured</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}

export function UserSettingsPage({
  apiUrl,
  canUseAdmin,
  connectedRepositoryCount,
  currentUser,
  isRefreshing,
  latestActivityLabel,
  onOpenProfile,
  onRefreshWorkspace,
  projectCount,
}: {
  apiUrl: string;
  canUseAdmin: boolean;
  connectedRepositoryCount: number;
  currentUser: AuthUser | null;
  isRefreshing: boolean;
  latestActivityLabel: string;
  onOpenProfile: () => void;
  onRefreshWorkspace: () => void;
  projectCount: number;
}) {
  const roleLabel = currentUser?.is_admin ? "Admin" : "Member";
  const repositoryCoverage =
    projectCount > 0
      ? `${connectedRepositoryCount.toLocaleString()} / ${projectCount.toLocaleString()}`
      : "No projects";

  return (
    <section className="settings-page" aria-label="Workspace settings">
      <section className="settings-hero" aria-labelledby="settings-title">
        <div className="settings-hero-copy">
          <span>Workspace controls</span>
          <h2 id="settings-title">Operational settings</h2>
          <p>Defaults, sync behavior, collector state, and access posture.</p>
        </div>
        <div className="settings-hero-actions">
          <button
            className="toolbar-button"
            disabled={isRefreshing}
            onClick={onRefreshWorkspace}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} strokeWidth={1.5} />
            <span>{isRefreshing ? "Refreshing" : "Refresh workspace"}</span>
          </button>
          <button className="toolbar-button" onClick={onOpenProfile} type="button">
            <User aria-hidden="true" size={15} strokeWidth={1.5} />
            <span>Profile</span>
          </button>
        </div>
      </section>

      <div className="settings-grid">
        <section className="settings-section" aria-labelledby="settings-workspace-title">
          <div className="settings-section-header">
            <Folder aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="settings-workspace-title">Workspace</h3>
              <p>Project list and workspace defaults.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>Default view</dt>
              <dd>Projects</dd>
            </div>
            <div className="settings-row">
              <dt>Project sort</dt>
              <dd>Recent activity</dd>
            </div>
            <div className="settings-row">
              <dt>Projects</dt>
              <dd>{projectCount.toLocaleString()}</dd>
            </div>
            <div className="settings-row">
              <dt>Latest activity</dt>
              <dd>{latestActivityLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="settings-section" aria-labelledby="settings-collector-title">
          <div className="settings-section-header">
            <Terminal aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="settings-collector-title">Collector</h3>
              <p>Local CLI and event ingestion.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>API endpoint</dt>
              <dd>
                <code>{apiUrl}</code>
              </dd>
            </div>
            <div className="settings-row">
              <dt>Event limit</dt>
              <dd>500 latest</dd>
            </div>
            <div className="settings-row">
              <dt>Ingestion</dt>
              <dd>
                <span className="settings-value-chip" data-tone="success">
                  Active
                </span>
              </dd>
            </div>
            <div className="settings-row">
              <dt>Session grouping</dt>
              <dd>Enabled</dd>
            </div>
          </dl>
        </section>

        <section className="settings-section" aria-labelledby="settings-sync-title">
          <div className="settings-section-header">
            <GitHubIcon />
            <div>
              <h3 id="settings-sync-title">Repository Sync</h3>
              <p>GitHub repository context and file browsing.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>Provider</dt>
              <dd>GitHub</dd>
            </div>
            <div className="settings-row">
              <dt>Repository coverage</dt>
              <dd>{repositoryCoverage}</dd>
            </div>
            <div className="settings-row">
              <dt>File browser</dt>
              <dd>GitHub-backed</dd>
            </div>
            <div className="settings-row">
              <dt>Refresh mode</dt>
              <dd>On demand</dd>
            </div>
          </dl>
        </section>

        <section className="settings-section" aria-labelledby="settings-ai-title">
          <div className="settings-section-header">
            <Bot aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="settings-ai-title">AI & Memory</h3>
              <p>Model detection and generated memory behavior.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>Model detection</dt>
              <dd>Auto-detect</dd>
            </div>
            <div className="settings-row">
              <dt>Memory generation</dt>
              <dd>Automatic</dd>
            </div>
            <div className="settings-row">
              <dt>Prompt detail</dt>
              <dd>Request, response, file changes</dd>
            </div>
            <div className="settings-row">
              <dt>Activity layout</dt>
              <dd>Prompts and sessions</dd>
            </div>
          </dl>
        </section>

        <section className="settings-section" aria-labelledby="settings-interface-title">
          <div className="settings-section-header">
            <Settings aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="settings-interface-title">Interface</h3>
              <p>Display defaults for the app shell.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>Theme</dt>
              <dd>Dark</dd>
            </div>
            <div className="settings-row">
              <dt>Density</dt>
              <dd>Compact</dd>
            </div>
            <div className="settings-row">
              <dt>Sidebar</dt>
              <dd>Workspace navigation</dd>
            </div>
            <div className="settings-row">
              <dt>Language</dt>
              <dd>English</dd>
            </div>
          </dl>
        </section>

        <section className="settings-section" aria-labelledby="settings-access-title">
          <div className="settings-section-header">
            <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.5} />
            <div>
              <h3 id="settings-access-title">Access</h3>
              <p>Authentication, role, and privileged controls.</p>
            </div>
          </div>
          <dl className="settings-list">
            <div className="settings-row">
              <dt>Authentication</dt>
              <dd>GitHub OAuth</dd>
            </div>
            <div className="settings-row">
              <dt>Role</dt>
              <dd>{roleLabel}</dd>
            </div>
            <div className="settings-row">
              <dt>Admin console</dt>
              <dd>{canUseAdmin ? "Available" : "Restricted"}</dd>
            </div>
            <div className="settings-row">
              <dt>Session</dt>
              <dd>
                <span className="settings-value-chip" data-tone="success">
                  Active
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
