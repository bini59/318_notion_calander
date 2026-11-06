// Adapted from @bini59/design 0.3.0 to localize its built-in labels.
import { useTranslations } from '@/lib/i18n-client'
import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';

// 321_auth/packages/contracts 재선언 (private 패키지). GET /me 응답과 동일.
export type Membership = { role: string; status: string; joinedAt: string };
export type AuthenticatedUser = {
  userId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  membership: Membership | null;
};

export type NavItem = { id: string; label: string; icon?: ReactNode; href?: string; children?: NavItem[] };

export type AppShellProps = {
  brand: { mark: ReactNode; name: string; host?: string; href?: string };
  nav: NavItem[];
  /** 메뉴 위 섹션 레이블 (예: "Platform"). */
  navLabel?: string;
  activeId: string;
  /** 앱 Router Link 주입. 없으면 <a href>. 반환한 엘리먼트가 nav-item 스타일을 그대로 받는다. */
  renderLink?: (item: NavItem, children: ReactNode) => ReactNode;
  /** 인증 없는 공개 사이트는 생략. user 없이 onLogout 만 주면 아무것도 렌더하지 않는다. */
  user?: AuthenticatedUser | null;
  /** 없으면 사이드바 로그아웃 버튼과 톱바 아바타를 렌더하지 않는다 (공개 사이트). */
  onLogout?: () => void;
  accountCenterUrl?: string;
  crumb: ReactNode;
  topbarActions?: ReactNode;
  /** ThemeToggle 등 */
  sidebarFoot?: ReactNode;
  /** 프로필 위치. 'sidebar' 면 왼쪽 아래 사이드바에 (톱바 아바타 대신). user 와 onLogout 이 모두 있을 때만 적용. */
  profilePlacement?: 'topbar' | 'sidebar';
  children: ReactNode;
};

type SidebarProps = Pick<AppShellProps, 'nav' | 'navLabel' | 'activeId' | 'renderLink' | 'onLogout' | 'sidebarFoot'> & { profile?: ReactNode };

const NAV_ITEM = 'flex w-full min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm cursor-pointer border-0 hover:bg-panel-2 hover:text-fg [&_a]:text-inherit [&_a]:no-underline';
// renderLink는 주입된 엘리먼트가 위 NAV_ITEM 박스 규격을 그대로 받아야 한다. 값 변경 시 양쪽 동기화.
const NAV_ITEM_CHILD = '[&>*]:flex [&>*]:w-full [&>*]:min-h-9 [&>*]:items-center [&>*]:gap-2.5 [&>*]:rounded-md [&>*]:px-2 [&>*]:py-1.5 [&>*]:text-sm';
const NAV_ACTIVE = 'bg-accent-soft text-accent font-medium';
const NAV_IDLE = 'bg-transparent text-fg';
const CHEVRON = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="ml-auto flex-none text-fg-2"><path d="m9 18 6-6-6-6" /></svg>;

export function UserAvatar({ user, className = '' }: { user: AuthenticatedUser | null; className?: string }) {
  const label = user?.name ?? user?.email ?? '';
  const avatarUrl = user?.avatarUrl && URL.canParse(user.avatarUrl) && new URL(user.avatarUrl).protocol === 'https:' ? user.avatarUrl : null;
  return (
    <div
      className={`grid size-7 flex-none place-items-center overflow-hidden rounded-full border border-line bg-panel-2 text-[11.5px] font-semibold text-fg-2 ${className}`}
      title={label || undefined}
    >
      {avatarUrl ? <img src={avatarUrl} referrerPolicy="no-referrer" alt={label} className="block size-full object-cover" /> : (label || '?').slice(0, 2).toUpperCase()}
    </div>
  );
}

export function Brand({ brand }: Pick<AppShellProps, 'brand'>) {
  const inner = (
    <>
      <div className="grid size-6 flex-none place-items-center overflow-hidden rounded-md bg-fg text-xs font-bold text-bg">{brand.mark}</div>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] font-semibold tracking-[-0.01em]">{brand.name}</span>
        {brand.host && <span className="truncate font-mono text-[10.5px] text-fg-3">{brand.host}</span>}
      </div>
    </>
  );
  const cls = 'flex min-w-0 items-center gap-[9px] text-fg no-underline hover:no-underline';
  return brand.href ? <a href={brand.href} className={cls}>{inner}</a> : <div className={cls}>{inner}</div>;
}

/** 사이드바 내용. 데스크탑 aside 와 모바일 drawer 가 공유한다. */
function SidebarBody({ nav, navLabel, activeId, renderLink, onLogout, sidebarFoot, profile }: SidebarProps) {
  const t = useTranslations()
  return (
    <>
      <nav aria-label={t('mainMenu')} className="mt-2">
        {navLabel && <div className="px-2 pt-2 pb-1.5 text-xs text-fg-2">{navLabel}</div>}
        <SidebarItems nav={nav} activeId={activeId} renderLink={renderLink} />
      </nav>
      <div className="flex-1" />
      {(sidebarFoot || onLogout || profile) && (
        <div className="grid gap-2.5 pt-3">
          {sidebarFoot}
          {profile}
          {onLogout && (
            <button type="button" onClick={onLogout} className={`${NAV_ITEM} ${NAV_IDLE}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              {t('logout')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function Sidebar({ brand, profile, ...body }: Pick<AppShellProps, 'brand'> & SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[238px] flex-none flex-col border-r border-line bg-panel px-2 py-3.5 min-[880px]:flex">
      <div className="-mx-2 -mt-3.5 flex h-[52px] flex-none items-center border-b border-line px-[18px]">
        <Brand brand={brand} />
      </div>
      <SidebarBody {...body} profile={profile} />
    </aside>
  );
}

/** 880px 미만에서 사이드바를 대체하는 drawer. 열림 상태는 AppShell 이 소유한다. */
export function MobileNav({ brand, open, onClose, ...body }: Pick<AppShellProps, 'brand'> & SidebarProps & { open: boolean; onClose: () => void }) {
  const t = useTranslations()
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 min-[880px]:hidden">
      <button type="button" aria-label={t('closeMenu')} tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default border-0 bg-black/50 p-0" />
      {/* 링크 클릭은 라우팅이 끝난 뒤 닫아야 하므로 캡처가 아닌 버블 단계에서 처리. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('mainMenu')}
        onClick={(event) => { if ((event.target as HTMLElement).closest('a')) onClose(); }}
        className="absolute inset-y-0 left-0 flex w-[268px] max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-panel px-2 py-3.5 shadow-panel"
      >
        <div className="-mx-2 -mt-3.5 flex h-[52px] flex-none items-center gap-2 border-b border-line px-[18px]">
          <Brand brand={brand} />
          <button type="button" onClick={onClose} aria-label={t('closeMenu')} className="ml-auto grid size-7 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-fg-2 hover:bg-panel-2 hover:text-fg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
        </div>
        <SidebarBody {...body} />
      </div>
    </div>
  );
}

function SidebarItems({ nav, activeId, renderLink }: Pick<AppShellProps, 'nav' | 'activeId' | 'renderLink'>) {
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {nav.map((item) => {
        const active = item.id === activeId;
        const cls = `${NAV_ITEM} ${active ? NAV_ACTIVE : NAV_IDLE}`;
        const inner = <>{item.icon}{item.label}{!!item.children?.length && CHEVRON}</>;
        const current = active ? 'page' : undefined;
        const link = renderLink?.(item, inner);
        return (
          <li key={item.id}>
            {renderLink ? (
              <div className={`rounded-md ${active ? NAV_ACTIVE : NAV_IDLE} hover:bg-panel-2 hover:text-fg ${NAV_ITEM_CHILD} [&_a]:text-inherit [&_a]:no-underline`}>
                {isValidElement<{ 'aria-current'?: 'page' }>(link) ? cloneElement(link, { 'aria-current': current }) : link}
              </div>
            ) : (
              <a href={item.href ?? '#'} aria-current={current} className={`${cls} no-underline hover:no-underline`}>{inner}</a>
            )}
            {!!item.children?.length && (
              <div className="ml-3.5 border-l border-line pl-2.5">
                <SidebarItems nav={item.children} activeId={activeId} renderLink={renderLink} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const svgProps = { viewBox: "0 0 24 24", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function ProfileMenu({ user, onLogout, accountCenterUrl = "https://auth.bini59.dev/client", placement = "topbar" }: { user: AuthenticatedUser; onLogout: () => void; accountCenterUrl?: string; placement?: "topbar" | "sidebar" }) {
  const t = useTranslations()
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const restoreFocus = useRef(false); // 키보드로 닫을 때만 트리거로 포커스 복귀 (바깥 클릭은 클릭한 곳 유지)

  const displayName = user.name ?? user.email ?? t('user');

  useEffect(() => {
    if (!open) {
      if (restoreFocus.current) triggerRef.current?.focus();
      restoreFocus.current = false;
      return;
    }
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreFocus.current = true;
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (!items.length) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      const forward = event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey);
      event.preventDefault();
      items[(current + (forward ? 1 : -1) + items.length) % items.length].focus();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const itemCls = "flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[13px] no-underline hover:bg-panel-2 ";
  const inSidebar = placement === "sidebar";

  return (
    <div ref={containerRef} className={inSidebar ? "relative min-w-0" : "relative flex items-center gap-2.5 min-w-0"}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${t('profileFor')} ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={inSidebar ? "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent p-2 text-left text-fg hover:bg-panel-2" : "flex min-w-0 items-center gap-2.5 rounded-full text-left"}
      >
        <UserAvatar user={user} className="hover:border-line-strong" />
        {inSidebar && (
          <>
            <span className="grid min-w-0 flex-1 leading-tight">
              <strong className="truncate text-[13px] font-medium">{displayName}</strong>
              {user.email ? <span className="truncate text-[11px] text-fg-3">{user.email}</span> : null}
            </span>
            <svg {...svgProps} width={14} height={14} className="flex-none text-fg-2"><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></svg>
          </>
        )}
      </button>
      {open ? (
        <div id={menuId} className={`absolute z-40 overflow-hidden rounded-[10px] border border-line-strong bg-panel shadow-panel ${inSidebar ? "bottom-full left-0 mb-2 w-full" : "top-full right-0 mt-2 w-[232px] max-w-[calc(100vw-32px)]"}`}>
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
            <UserAvatar user={user} />
            <span className="grid min-w-0">
              <strong className="truncate text-[12.5px] font-semibold text-fg">{displayName}</strong>
              {user.email ? <span className="truncate text-[11px] text-fg-3">{user.email}</span> : null}
            </span>
          </div>
          <div ref={menuRef} role="menu" aria-label={t('profileMenu')} className="grid gap-0.5 p-1.5">
            <a role="menuitem" href={accountCenterUrl} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)} className={itemCls + "text-fg-2 hover:text-fg"}>
              <svg {...svgProps} className="shrink-0"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
              <span>{t('accountCenter')}<span className="sr-only">{t('newWindow')}</span></span>
              <svg {...svgProps} width={13} height={13} className="ml-auto shrink-0 text-fg-3"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
            </a>
            <button role="menuitem" type="button" onClick={() => { setOpen(false); onLogout(); }} className={itemCls + "text-danger hover:bg-danger/10"}>
              <svg {...svgProps} className="shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              <span>{t('logout')}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Topbar({ crumb, children, user, onLogout, accountCenterUrl, onMenuOpen }: { crumb: ReactNode; children?: ReactNode; user?: AuthenticatedUser | null; onLogout?: () => void; accountCenterUrl?: string; onMenuOpen?: () => void }) {
  const t = useTranslations()
  return (
    <header className="sticky top-0 z-20 flex h-[52px] items-center gap-3.5 border-b border-line bg-bg px-[22px]">
      {onMenuOpen && (
        <button type="button" onClick={onMenuOpen} aria-label={t('openMenu')} className="-ml-1.5 grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-fg-2 hover:bg-panel-2 hover:text-fg min-[880px]:hidden">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
        </button>
      )}
      <div className="flex min-w-0 items-center gap-2 truncate text-[13px] text-fg-3 [&_strong]:font-medium [&_strong]:text-fg">{crumb}</div>
      <span className="flex-1" />
      {children}
      {/* onLogout 없음 = 인증 없는 공개 사이트. user 만 없으면(비-SSO 어드민) 빈 아바타. */}
      {!onLogout ? null : user ? <ProfileMenu key={user.userId} user={user} onLogout={onLogout} accountCenterUrl={accountCenterUrl} /> : <UserAvatar user={null} />}
    </header>
  );
}

export function AppShell({ brand, nav, navLabel, activeId, renderLink, user, onLogout, crumb, topbarActions, sidebarFoot, accountCenterUrl, profilePlacement = 'topbar', children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const inSidebar = profilePlacement === 'sidebar' && !!user && !!onLogout;
  // 사이드바 프로필 메뉴에 로그아웃이 있으므로 별도 로그아웃 버튼/톱바 아바타는 뺀다.
  const shellLogout = inSidebar ? undefined : onLogout;
  const profile = inSidebar ? <ProfileMenu key={user.userId} user={user} onLogout={onLogout} accountCenterUrl={accountCenterUrl} placement="sidebar" /> : undefined;
  return (
    <div className="flex min-h-screen">
      <Sidebar brand={brand} nav={nav} navLabel={navLabel} activeId={activeId} renderLink={renderLink} onLogout={shellLogout} sidebarFoot={sidebarFoot} profile={profile} />
      <MobileNav brand={brand} nav={nav} navLabel={navLabel} activeId={activeId} renderLink={renderLink} onLogout={shellLogout} sidebarFoot={sidebarFoot} profile={profile} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar crumb={crumb} user={user} onLogout={shellLogout} accountCenterUrl={accountCenterUrl} onMenuOpen={() => setMenuOpen(true)}>{topbarActions}</Topbar>
        <main className="w-full max-w-[1240px] flex-1 px-[22px] pt-[26px] pb-[60px]">{children}</main>
      </div>
    </div>
  );
}
