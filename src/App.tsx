/**
 * Luma frontend, everything in ONE file (config, types, API client, state, components, pages, App).
 * Styles are in index.css. Edit RAILWAY_API_URL below.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Aperture, ArrowLeft, ArrowRight, Bell, Bookmark, Camera, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Compass, Database, Download, Eye, EyeOff, FileImage, Flag, Grid3X3, Hash, Heart, Home, ImagePlus, Lock, LogOut, Mail, MapPin, Menu, MessageCircle, Moon, MoreHorizontal, Music2, Palette, Pause, Phone, Play, Plus, Search, Send, Share2, Shield, Smile, SquarePen, Sun, Trash2, Upload, UserPlus, UserRound, Users, Volume2, VolumeX, X, Settings as SettingsIcon, Activity as ActivityIcon } from 'lucide-react'

// ========================================================================
// CONFIG
// ========================================================================
const brand = {
  name: 'Luma',
  tagline: 'Keep the moments that move you.',
  accent: '#ff8264',
}

// 👉 Put your Railway backend URL here (no "/" at the end).
//    Find it in Railway: backend service → Settings → Networking → Public Domain.
const RAILWAY_API_URL = 'https://server-production-2461.up.railway.app'

const API_CONFIG = {
  // VITE_API_BASE_URL (if set on GitHub/locally) wins; otherwise the URL above is used.
  baseUrl: String(import.meta.env.VITE_API_BASE_URL || RAILWAY_API_URL).replace(/\/+$/, ''),
  credentials: 'include' as RequestCredentials,
}


// ========================================================================
// TYPES
// ========================================================================
type Route = 'home' | 'explore' | 'reels' | 'messages' | 'notifications' | 'profile' | 'settings' | 'saved' | 'activity' | 'auth'

type MediaType = 'image' | 'video' | 'carousel'

interface User {
  id: string
  name: string
  username: string
  avatar: string
  bio?: string
  verified?: boolean
  online?: boolean
}

interface Me extends User {
  email: string | null
  phone: string | null
  contactVerified: boolean
  settings: Record<string, boolean | number | string>
  createdAt: string
}

interface ProfileData extends User {
  followers: number
  following: number
  posts: number
  isFollowing: boolean
  followsYou: boolean
  isMe: boolean
}

interface Comment {
  id: string
  user: User
  text: string
  time: string
  createdAt: string
}

interface Post {
  id: string
  user: User
  type: MediaType
  image: string
  video?: string
  poster?: string
  images?: string[]
  audio?: string
  location: string
  caption: string
  likes: number
  commentsCount: number
  comments: Comment[]
  time: string
  createdAt: string
  liked: boolean
  saved: boolean
}

/** Small tile used in Explore / Saved / Activity grids. */
interface GridItem {
  id: string
  type: MediaType
  image: string
  video?: string
  likes?: number
  commentsCount?: number
}

interface Story {
  id: string
  user: User
  image: string
  video?: string
  kind: 'image' | 'video'
  time: string
  createdAt: string
  expiresAt: string
  closeFriends: boolean
  seen: boolean
}

interface Reel {
  id: string
  user: User
  video: string
  poster: string
  caption: string
  audio: string
  likes: number
  comments: number
  liked: boolean
  saved: boolean
  time: string
}

interface Conversation {
  id: string
  user: User
  lastMessage: string
  lastSender: 'me' | 'them' | null
  time: string
  lastMessageAt: string
  unread: number
}

interface Message {
  id: string
  from: 'me' | 'them'
  text: string
  deleted: boolean
  reaction?: string
  time: string
  createdAt: string
}

interface NotificationItem {
  id: string
  type: 'like' | 'comment' | 'follow'
  user: User
  post: GridItem | null
  text: string
  read: boolean
  time: string
  createdAt: string
}

interface ActivityItem {
  id: string
  type: 'like' | 'comment'
  post: GridItem
  text: string
  time: string
  createdAt: string
}

interface ReportTarget {
  type: 'post' | 'user' | 'comment' | 'story' | 'message'
  target: string
  label: string
}


// ========================================================================
// API
// ========================================================================
class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let unauthorizedHandler: (() => void) | null = null
/** Called when the server says the session is gone (401 UNAUTHENTICATED), so the app can show the login page. */
function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

const errorMessage = (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong. Please try again.')

/**
 * Backend adapter. Set VITE_API_BASE_URL to the API origin (no trailing slash).
 * Auth is an httpOnly cookie set by the server, so nothing secret lives in the browser.
 * Errors carry the server's message ({ error, code }) so the UI can show it as-is.
 */
async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_CONFIG.baseUrl) throw new Error('Backend is not connected. Set VITE_API_BASE_URL and rebuild the app.')
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(`${API_CONFIG.baseUrl}${path}`, { ...options, headers, credentials: API_CONFIG.credentials })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && data?.code === 'UNAUTHENTICATED') unauthorizedHandler?.()
    throw new ApiError(data?.error ?? `Request failed with status ${response.status}`, response.status, data?.code)
  }
  return data as T
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

const api = {
  get: <T,>(path: string) => apiRequest<T>(path),
  post: <T,>(path: string, body?: unknown) => apiRequest<T>(path, json('POST', body)),
  put: <T,>(path: string, body?: unknown) => apiRequest<T>(path, json('PUT', body)),
  patch: <T,>(path: string, body?: unknown) => apiRequest<T>(path, json('PATCH', body)),
  del: <T,>(path: string, body?: unknown) => apiRequest<T>(path, json('DELETE', body)),
  /** Upload a photo/video; returns { id, url, kind }. Send the id in mediaIds when creating a post/story. */
  upload: <T = { id: string; url: string; kind: 'image' | 'video' }>(file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiRequest<T>('/api/media', { method: 'POST', body: form })
  },
}

const endpoints = {
  session: '/api/auth/session',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  logoutAll: '/api/auth/logout-all',
  signup: '/api/auth/signup',
  usernameAvailability: '/api/auth/username-availability',
  requestOtp: '/api/auth/otp/request',
  verifyOtp: '/api/auth/otp/verify',
  resetPassword: '/api/auth/password/reset',
  feed: '/api/posts/feed',
  saved: '/api/posts/saved',
  posts: '/api/posts',
  stories: '/api/stories',
  reels: '/api/reels',
  explore: '/api/explore',
  search: '/api/search',
  activity: '/api/activity',
  reports: '/api/reports',
  conversations: '/api/conversations',
  notifications: '/api/notifications',
  suggestions: '/api/users/suggestions',
  users: '/api/users',
  me: '/api/users/me',
}


// ========================================================================
// STATE (context)
// ========================================================================
const routes: Route[] = ['home', 'explore', 'reels', 'messages', 'notifications', 'profile', 'settings', 'saved', 'activity', 'auth']

/** Hash looks like  #/home  or  #/home?post=<id>  (the second form is the shareable post link). */
function parseHash(): { route: Route; post: string | null } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [name, query = ''] = raw.split('?')
  return { route: routes.includes(name as Route) ? (name as Route) : 'home', post: new URLSearchParams(query).get('post') }
}

type SettingsPatch = Record<string, boolean | number | string>

interface SocialContextValue {
  route: Route
  navigate: (route: Route) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
  me: Me | null
  authReady: boolean
  setSession: (user: Me | null) => void
  logout: () => Promise<void>
  updateSettings: (patch: SettingsPatch) => Promise<void>
  following: Set<string>
  toggleFollow: (username: string) => Promise<void>
  profileUsername: string | null
  viewProfile: (user: { username: string }) => void
  stories: Story[]
  refreshStories: () => Promise<void>
  storyIndex: number | null
  openStory: (index: number) => void
  closeStory: () => void
  createMode: 'post' | 'story' | null
  openCreate: (mode?: 'post' | 'story') => void
  closeCreate: () => void
  reportTarget: ReportTarget | null
  openReport: (target: ReportTarget) => void
  closeReport: () => void
  openPostId: string | null
  openPost: (id: string) => void
  closePost: () => void
  feedVersion: number
  notifyFeedChanged: () => void
  pendingChat: Conversation | null
  openChatWith: (username: string) => Promise<void>
  clearPendingChat: () => void
  unreadMessages: number
  unreadNotifications: number
  refreshCounts: () => Promise<void>
  toast: string
  showToast: (message: string) => void
}

const SocialContext = createContext<SocialContextValue | null>(null)

function SocialProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseHash().route)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('luma-theme') === 'dark' ? 'dark' : 'light')
  const [me, setMe] = useState<Me | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [storyIndex, setStoryIndex] = useState<number | null>(null)
  const [createMode, setCreateMode] = useState<'post' | 'story' | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [openPostId, setOpenPostId] = useState<string | null>(() => parseHash().post)
  const [feedVersion, setFeedVersion] = useState(0)
  const [pendingChat, setPendingChat] = useState<Conversation | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [toast, setToast] = useState('')
  const followingRef = useRef(following)
  const meId = me?.id ?? null
  const meUsername = me?.username ?? null

  useEffect(() => { followingRef.current = following }, [following])

  useEffect(() => {
    const onHash = () => setRoute(parseHash().route)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('luma-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const navigate = useCallback((next: Route) => {
    setRoute(next)
    if (window.location.hash !== `#/${next}`) window.location.hash = `/${next}`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const showToast = useCallback((message: string) => {
    setToast('')
    window.setTimeout(() => setToast(message), 10)
  }, [])

  /* ---------- session ---------- */
  useEffect(() => {
    let cancelled = false
    api.get<{ user: Me | null }>(endpoints.session)
      .then(res => { if (!cancelled) setMe(res.user) })
      .catch(() => { /* backend offline or not configured: the login page shows the reason on first request */ })
      .finally(() => { if (!cancelled) setAuthReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => { setMe(null); setFollowing(new Set()); setStories([]); setRoute('auth') })
    return () => setUnauthorizedHandler(null)
  }, [])

  const setSession = useCallback((user: Me | null) => { setMe(user) }, [])

  const logout = useCallback(async () => {
    try { await api.post(endpoints.logout) } catch { /* cookie is cleared server-side when reachable; clear local state anyway */ }
    setMe(null); setFollowing(new Set()); setStories([]); setProfileUsername(null); setUnreadMessages(0); setUnreadNotifications(0)
    navigate('auth')
  }, [navigate])

  useEffect(() => { if (meId && route === 'auth') navigate('home') }, [meId, route, navigate])

  /* ---------- people I follow ---------- */
  useEffect(() => {
    if (!meId || !meUsername) return
    let cancelled = false
    type Page = { users: { username: string }[]; nextCursor: string | null }
    ;(async () => {
      const names = new Set<string>()
      let cursor: string | null = null
      for (let i = 0; i < 20; i++) {
        const res: Page = await api.get<Page>(`${endpoints.users}/${meUsername}/following?limit=50${cursor ? `&cursor=${cursor}` : ''}`)
        res.users.forEach(user => names.add(user.username))
        cursor = res.nextCursor
        if (!cursor) break
      }
      if (!cancelled) setFollowing(names)
    })().catch(() => {})
    return () => { cancelled = true }
  }, [meId, meUsername])

  const toggleFollow = useCallback(async (username: string) => {
    const already = followingRef.current.has(username)
    try {
      if (already) await api.del(`${endpoints.users}/${encodeURIComponent(username)}/follow`)
      else await api.post(`${endpoints.users}/${encodeURIComponent(username)}/follow`)
      setFollowing(previous => {
        const next = new Set(previous)
        if (already) next.delete(username); else next.add(username)
        return next
      })
    } catch (reason) { showToast(errorMessage(reason)) }
  }, [showToast])

  /* ---------- stories ---------- */
  const refreshStories = useCallback(async () => {
    try {
      const res = await api.get<{ stories: Story[] }>(endpoints.stories)
      setStories(res.stories)
    } catch { /* keep the old strip */ }
  }, [])
  useEffect(() => { if (meId) refreshStories() }, [meId, refreshStories])

  /* ---------- unread badges ---------- */
  const refreshCounts = useCallback(async () => {
    try {
      const [inbox, notes] = await Promise.all([
        api.get<{ unreadTotal: number }>(endpoints.conversations),
        api.get<{ unreadCount: number }>(`${endpoints.notifications}/unread-count`),
      ])
      setUnreadMessages(inbox.unreadTotal); setUnreadNotifications(notes.unreadCount)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    if (!meId) return
    refreshCounts()
    const timer = window.setInterval(refreshCounts, 30000)
    return () => window.clearInterval(timer)
  }, [meId, route, refreshCounts])

  /* ---------- settings saved on the server (theme, text size, reduce motion, autoplay) ---------- */
  const updateSettings = useCallback(async (patch: SettingsPatch) => {
    setMe(current => current ? { ...current, settings: { ...current.settings, ...patch } } : current)
    try { await api.patch(`${endpoints.me}/settings`, patch) } catch (reason) { showToast(errorMessage(reason)) }
  }, [showToast])

  const settings = me?.settings
  useEffect(() => {
    if (!settings) return
    if (settings.theme === 'dark' || settings.theme === 'light') setTheme(settings.theme)
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion === true)
    document.documentElement.style.fontSize = settings.textSize === 'large' ? '18px' : settings.textSize === 'small' ? '14px' : ''
  }, [settings])

  const toggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    if (meId) updateSettings({ theme: next })
  }, [theme, meId, updateSettings])

  /* ---------- chat shortcut (Profile -> Message) ---------- */
  const openChatWith = useCallback(async (username: string) => {
    try {
      const res = await api.post<{ conversation: Conversation }>(endpoints.conversations, { username })
      setPendingChat(res.conversation)
      navigate('messages')
    } catch (reason) { showToast(errorMessage(reason)) }
  }, [navigate, showToast])

  const viewProfile = useCallback((user: { username: string }) => { setProfileUsername(user.username); navigate('profile') }, [navigate])
  const openStory = useCallback((index: number) => setStoryIndex(index), [])
  const closeStory = useCallback(() => setStoryIndex(null), [])
  const openCreate = useCallback((mode: 'post' | 'story' = 'post') => setCreateMode(mode), [])
  const closeCreate = useCallback(() => setCreateMode(null), [])
  const openReport = useCallback((target: ReportTarget) => setReportTarget(target), [])
  const closeReport = useCallback(() => setReportTarget(null), [])
  const openPost = useCallback((id: string) => setOpenPostId(id), [])
  const closePost = useCallback(() => setOpenPostId(null), [])
  const notifyFeedChanged = useCallback(() => setFeedVersion(value => value + 1), [])
  const clearPendingChat = useCallback(() => setPendingChat(null), [])

  const value = useMemo<SocialContextValue>(() => ({
    route, navigate, theme, toggleTheme, me, authReady, setSession, logout, updateSettings,
    following, toggleFollow, profileUsername, viewProfile,
    stories, refreshStories, storyIndex, openStory, closeStory,
    createMode, openCreate, closeCreate, reportTarget, openReport, closeReport,
    openPostId, openPost, closePost, feedVersion, notifyFeedChanged,
    pendingChat, openChatWith, clearPendingChat,
    unreadMessages, unreadNotifications, refreshCounts, toast, showToast,
  }), [route, navigate, theme, toggleTheme, me, authReady, setSession, logout, updateSettings, following, toggleFollow, profileUsername, viewProfile,
    stories, refreshStories, storyIndex, openStory, closeStory, createMode, openCreate, closeCreate, reportTarget, openReport, closeReport,
    openPostId, openPost, closePost, feedVersion, notifyFeedChanged, pendingChat, openChatWith, clearPendingChat,
    unreadMessages, unreadNotifications, refreshCounts, toast, showToast])

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
}

function useSocial() {
  const context = useContext(SocialContext)
  if (!context) throw new Error('useSocial must be used within SocialProvider')
  return context
}


// ========================================================================
// COMPONENTS
// ========================================================================

// ---- Avatar ----
function Avatar({ user, size = 'md', ring = false, onClick, label }: { user: User; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; ring?: boolean; onClick?: () => void; label?: string }) {
  const content = <><img src={user.avatar} alt={`${user.name}'s profile`} /><span className="sr-only">{label ?? user.name}</span></>
  const className = `avatar avatar-${size} ${ring ? 'avatar-ring' : ''} ${onClick ? 'avatar-button' : ''}`
  return onClick ? <button type="button" className={className} onClick={onClick} aria-label={label ?? `View ${user.name}'s profile`}>{content}</button> : <span className={className}>{content}</span>
}

// ---- Brand ----
function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span className={`brand ${inverse ? 'brand-inverse' : ''}`} aria-label={brand.name}>
      <span className="brand-mark"><Aperture size={compact ? 19 : 22} strokeWidth={1.8} /></span>
      {!compact && <span className="brand-word">{brand.name}</span>}
    </span>
  )
}

// ---- Controls ----
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'toggle-on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
}

function SettingRow({ icon: Icon, title, description, onClick, trailing, danger = false }: { icon?: React.ComponentType<{ size?: number }>; title: string; description?: string; onClick?: () => void; trailing?: React.ReactNode; danger?: boolean }) {
  const content = <>{Icon && <span className="setting-icon"><Icon size={19} /></span>}<span className="setting-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span><span className="setting-trailing">{trailing ?? <ChevronRight size={18} />}</span></>
  return onClick ? <button type="button" className={`setting-row ${danger ? 'danger-text' : ''}`} onClick={onClick}>{content}</button> : <div className={`setting-row ${danger ? 'danger-text' : ''}`}>{content}</div>
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" className={`check-box ${checked ? 'checked' : ''}`} onClick={onChange} aria-pressed={checked} aria-label={label}>{checked && <Check size={13} />}</button>
}

// ---- Modal ----
function Modal({ title, eyebrow, children, onClose, className = '', hideHeader = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; className?: string; hideHeader?: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex="0"]')
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        {!hideHeader && <div className="modal-header">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </div>}
        {children}
      </div>
    </div>
  )
}

// ---- MediaThumb ----
/** Square thumbnail for a post/story: image if there is one, otherwise the first frame of the video. */
function MediaThumb({ image, video, alt }: { image?: string; video?: string; alt: string }) {
  if (image) return <img src={image} alt={alt} loading="lazy" />
  if (video) return <video src={video} muted playsInline preload="metadata" aria-label={alt} />
  return <span className="thumb-empty" aria-label={alt} />
}

// ---- AppShell ----
function AppShell({ children }: { children: ReactNode }) {
  const { route, navigate, viewProfile, openCreate, theme, toggleTheme, logout, me, unreadMessages, unreadNotifications } = useSocial()
  if (!me) return null
  const primaryNav: { route: Route; label: string; icon: typeof Home; badge?: number }[] = [
    { route: 'home', label: 'Home', icon: Home },
    { route: 'explore', label: 'Explore', icon: Compass },
    { route: 'reels', label: 'Reels', icon: Clapperboard },
    { route: 'messages', label: 'Messages', icon: MessageCircle, badge: unreadMessages },
    { route: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
  ]
  const navItem = (item: typeof primaryNav[number]) => {
    const Icon = item.icon
    return <button key={item.route} type="button" className={`nav-item ${route === item.route ? 'active' : ''}`} onClick={() => navigate(item.route)} aria-current={route === item.route ? 'page' : undefined}>
      <span className="nav-icon"><Icon size={22} strokeWidth={route === item.route ? 2.4 : 1.8} />{!!item.badge && <span className="nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>}</span><span>{item.label}</span>
    </button>
  }

  return <div className={`app-shell route-${route}`}>
    <aside className="desktop-sidebar">
      <button className="sidebar-brand" type="button" onClick={() => navigate('home')} aria-label="Luma home"><Brand /></button>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {primaryNav.map(navItem)}
        <button type="button" className="nav-item" onClick={() => openCreate('post')}><span className="nav-icon"><Plus size={23} /></span><span>Create</span></button>
        <button type="button" className={`nav-item ${route === 'profile' ? 'active' : ''}`} onClick={() => viewProfile(me)}><Avatar user={me} size="xs" /><span>Profile</span></button>
      </nav>
      <div className="sidebar-bottom">
        <details className="more-menu">
          <summary className="nav-item"><span className="nav-icon"><Menu size={22} /></span><span>More</span></summary>
          <div className="more-popover">
            <button type="button" onClick={() => navigate('settings')}><SettingsIcon size={18} />Settings</button>
            <button type="button" onClick={() => navigate('activity')}><ActivityIcon size={18} />Your activity</button>
            <button type="button" onClick={() => navigate('saved')}><Bookmark size={18} />Saved</button>
            <button type="button" onClick={toggleTheme}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}{theme === 'light' ? 'Dark appearance' : 'Light appearance'}</button>
            <button type="button" onClick={() => { logout() }}><LogOut size={18} />Log out</button>
          </div>
        </details>
      </div>
    </aside>

    <header className="mobile-header">
      <button type="button" className="mobile-brand" onClick={() => navigate('home')} aria-label="Luma home"><Brand /></button>
      <div className="mobile-header-actions">
        <button className="icon-button mobile-search" type="button" onClick={() => navigate('explore')} aria-label="Search"><Search size={21} /></button>
        <button className="icon-button" type="button" onClick={() => navigate('notifications')} aria-label="Notifications"><Bell size={22} />{unreadNotifications > 0 && <span className="header-dot" />}</button>
        <button className="icon-button" type="button" onClick={() => navigate('messages')} aria-label="Messages"><MessageCircle size={22} />{unreadMessages > 0 && <span className="header-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}</button>
      </div>
    </header>

    <main className="app-main">{children}</main>

    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <button type="button" className={route === 'home' ? 'active' : ''} onClick={() => navigate('home')} aria-label="Home"><Home size={23} /></button>
      <button type="button" className={route === 'explore' ? 'active' : ''} onClick={() => navigate('explore')} aria-label="Search and explore"><Search size={23} /></button>
      <button type="button" className="mobile-create" onClick={() => openCreate('post')} aria-label="Create post"><Plus size={24} /></button>
      <button type="button" className={route === 'reels' ? 'active' : ''} onClick={() => navigate('reels')} aria-label="Reels"><Clapperboard size={23} /></button>
      <button type="button" className={route === 'profile' ? 'active' : ''} onClick={() => viewProfile(me)} aria-label="Profile"><Avatar user={me} size="xs" /></button>
    </nav>
  </div>
}

// ---- PostCard ----
function PostCard({ post, onDeleted }: { post: Post; onDeleted?: (id: string) => void }) {
  const { me, following, toggleFollow, viewProfile, openReport, showToast } = useSocial()
  const [data, setData] = useState(post)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[] | null>(null) // newest first, as the API returns them
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingComments, setLoadingComments] = useState(false)
  const [comment, setComment] = useState('')
  const [slide, setSlide] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.caption)
  const images = data.images ?? [data.image]
  const mine = me?.id === data.user.id
  const isFollowing = following.has(data.user.username)
  const postUrl = `${endpoints.posts}/${data.id}`

  const loadComments = async (from: string | null) => {
    setLoadingComments(true)
    try {
      const res = await api.get<{ comments: Comment[]; nextCursor: string | null }>(`${postUrl}/comments?limit=20${from ? `&cursor=${from}` : ''}`)
      setComments(previous => from && previous ? [...previous, ...res.comments] : res.comments)
      setCursor(res.nextCursor)
    } catch (reason) { showToast(errorMessage(reason)) } finally { setLoadingComments(false) }
  }
  const toggleComments = () => {
    const next = !showComments
    setShowComments(next)
    if (next && comments === null) loadComments(null)
  }

  const toggleLike = async () => {
    const was = data.liked
    setData(item => ({ ...item, liked: !was, likes: Math.max(0, item.likes + (was ? -1 : 1)) }))
    try {
      const res = was ? await api.del<{ liked: boolean; likes: number }>(`${postUrl}/like`) : await api.post<{ liked: boolean; likes: number }>(`${postUrl}/like`)
      setData(item => ({ ...item, liked: res.liked, likes: res.likes }))
    } catch (reason) {
      setData(item => ({ ...item, liked: was, likes: Math.max(0, item.likes + (was ? 1 : -1)) }))
      showToast(errorMessage(reason))
    }
  }
  const toggleSave = async () => {
    const was = data.saved
    setData(item => ({ ...item, saved: !was }))
    try {
      if (was) await api.del(`${postUrl}/save`); else await api.post(`${postUrl}/save`)
      showToast(was ? 'Removed from saved.' : 'Saved to your collection.')
    } catch (reason) { setData(item => ({ ...item, saved: was })); showToast(errorMessage(reason)) }
  }

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/home?post=${data.id}`
    try { await navigator.clipboard.writeText(url); showToast('Post link copied.') } catch { showToast('Share link: ' + url) }
  }
  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = comment.trim()
    if (!text) return
    try {
      const res = await api.post<{ comment: Comment; commentsCount: number }>(`${postUrl}/comments`, { text })
      setComment('')
      setData(item => ({ ...item, commentsCount: res.commentsCount }))
      if (comments === null) { setShowComments(true); await loadComments(null) } else { setComments([res.comment, ...comments]); setShowComments(true) }
    } catch (reason) { showToast(errorMessage(reason)) }
  }
  const deleteComment = async (item: Comment) => {
    try {
      await api.del(`${postUrl}/comments/${item.id}`)
      setComments(previous => previous ? previous.filter(c => c.id !== item.id) : previous)
      setData(current => ({ ...current, commentsCount: Math.max(0, current.commentsCount - 1) }))
    } catch (reason) { showToast(errorMessage(reason)) }
  }
  const deletePost = async () => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    try { await api.del(postUrl); showToast('Post deleted.'); onDeleted?.(data.id) } catch (reason) { showToast(errorMessage(reason)) }
  }
  const saveCaption = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const res = await api.patch<{ post: Post }>(postUrl, { caption: draft })
      setData(res.post); setEditing(false); showToast('Caption updated.')
    } catch (reason) { showToast(errorMessage(reason)) }
  }

  return <article className="post-card" id={`post-${data.id}`}>
    <header className="post-header">
      <div className="post-author"><Avatar user={data.user} size="sm" ring onClick={() => viewProfile(data.user)} /><div><div className="author-line"><button type="button" onClick={() => viewProfile(data.user)}>{data.user.username}</button>{data.user.verified && <span className="verified"><Check size={10} /></span>}<span className="post-time">· {data.time}</span></div>{data.location && <span className="post-location"><MapPin size={11} />{data.location}</span>}</div></div>
      <details className="action-menu">
        <summary className="icon-button" aria-label="Post options"><MoreHorizontal size={22} /></summary>
        <div className="action-popover">
          {mine && <button type="button" onClick={() => { setDraft(data.caption); setEditing(true) }}>Edit caption</button>}
          {mine && <button type="button" className="danger-text" onClick={deletePost}><Trash2 size={15} /> Delete post</button>}
          {!mine && <button type="button" onClick={() => toggleFollow(data.user.username)}>{isFollowing ? 'Unfollow' : 'Follow'} {data.user.username}</button>}
          <button type="button" onClick={share}>Copy link</button>
          {!mine && <button type="button" className="danger-text" onClick={() => openReport({ type: 'post', target: data.id, label: `post by ${data.user.username}` })}>Report</button>}
        </div>
      </details>
    </header>

    <div className="post-media" onDoubleClick={() => { if (!data.liked) toggleLike() }}>
      {data.type === 'video' && data.video ? <video src={data.video} poster={data.poster || data.image || undefined} controls playsInline className="active" aria-label={data.caption} /> : images.map((image, index) => <img key={image} src={image} alt={index === 0 ? data.caption : `Post media ${index + 1}`} className={index === slide ? 'active' : ''} loading="lazy" />)}
      {images.length > 1 && data.type !== 'video' && <>
        {slide > 0 && <button type="button" className="carousel-arrow carousel-prev" onClick={() => setSlide(slide - 1)} aria-label="Previous image"><ChevronLeft size={18} /></button>}
        {slide < images.length - 1 && <button type="button" className="carousel-arrow carousel-next" onClick={() => setSlide(slide + 1)} aria-label="Next image"><ChevronRight size={18} /></button>}
        <span className="carousel-count">{slide + 1}/{images.length}</span>
        <div className="carousel-dots">{images.map((_, index) => <span key={index} className={index === slide ? 'active' : ''} />)}</div>
      </>}
    </div>

    <div className="post-content">
      <div className="post-actions">
        <div><button type="button" className={`icon-button ${data.liked ? 'liked' : ''}`} onClick={toggleLike} aria-label={data.liked ? 'Unlike post' : 'Like post'} aria-pressed={data.liked}><Heart size={24} fill={data.liked ? 'currentColor' : 'none'} /></button><button type="button" className="icon-button" onClick={toggleComments} aria-label="Show comments"><MessageCircle size={23} /></button><button type="button" className="icon-button" onClick={share} aria-label="Share post"><Send size={23} /></button></div>
        <button type="button" className={`icon-button ${data.saved ? 'saved' : ''}`} onClick={toggleSave} aria-label={data.saved ? 'Unsave post' : 'Save post'}><Bookmark size={23} fill={data.saved ? 'currentColor' : 'none'} /></button>
      </div>
      <button type="button" className="post-likes" onClick={toggleComments}>{data.likes.toLocaleString()} {data.likes === 1 ? 'like' : 'likes'}</button>
      {editing ? <form className="edit-caption" onSubmit={saveCaption}><textarea value={draft} onChange={event => setDraft(event.target.value.slice(0, 2200))} rows={3} aria-label="Edit caption" /><div><button type="button" className="text-button" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="text-button">Save</button></div></form> : data.caption && <p className="post-caption"><button type="button" onClick={() => viewProfile(data.user)}>{data.user.username}</button> {data.caption}</p>}
      {data.commentsCount > 0 && <button type="button" className="view-comments" onClick={toggleComments}>{showComments ? 'Hide comments' : `View all ${data.commentsCount} comment${data.commentsCount === 1 ? '' : 's'}`}</button>}
      {showComments && <div className="comments-list">
        {cursor && <button type="button" className="text-button load-older" onClick={() => loadComments(cursor)} disabled={loadingComments}>View older comments</button>}
        {loadingComments && !comments?.length && <span className="loading-spinner" />}
        {comments && [...comments].reverse().map(item => <div className="comment" key={item.id}><Avatar user={item.user} size="xs" /><p><button type="button" onClick={() => viewProfile(item.user)}>{item.user.username}</button>{item.text}<small>{item.time}</small></p>{(item.user.id === me?.id || mine) && <button type="button" className="comment-like comment-delete" aria-label="Delete comment" onClick={() => deleteComment(item)}><Trash2 size={13} /></button>}</div>)}
      </div>}
      <form className="comment-form" onSubmit={submitComment}><button type="button" className="icon-button" onClick={() => setComment(comment + ' ✨')} aria-label="Add emoji"><Smile size={20} /></button><input value={comment} onChange={event => setComment(event.target.value.slice(0, 500))} placeholder="Add a comment…" aria-label="Add a comment" /><button type="submit" className="text-button" disabled={!comment.trim()}>Post</button></form>
    </div>
  </article>
}

// ---- PostViewer ----
/** Opens any post (from Explore, Profile, Notifications, Reels, a shared link…) in a dialog. */
function PostViewer() {
  const { openPostId, closePost, notifyFeedChanged } = useSocial()
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!openPostId) return
    let cancelled = false
    setPost(null); setError('')
    api.get<{ post: Post }>(`${endpoints.posts}/${openPostId}`)
      .then(res => { if (!cancelled) setPost(res.post) })
      .catch(reason => { if (!cancelled) setError(errorMessage(reason)) })
    return () => { cancelled = true }
  }, [openPostId])

  if (!openPostId) return null
  return <Modal title="Post" eyebrow="Luma" onClose={closePost} className="modal-sm post-viewer">
    {post ? <PostCard key={post.id} post={post} onDeleted={() => { closePost(); notifyFeedChanged() }} /> : error ? <div className="form-message error" role="alert">{error}</div> : <div className="viewer-loading"><span className="loading-spinner" /></div>}
  </Modal>
}

// ---- ReportDialog ----
const reasons = ['Spam or misleading', 'Harassment or hate', 'Inappropriate content', 'Intellectual property', 'Something else']

function ReportDialog() {
  const { reportTarget, closeReport, showToast } = useSocial()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  if (!reportTarget) return null
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!reason) { showToast('Choose a reason to continue.'); return }
    setBusy(true)
    try {
      await api.post(endpoints.reports, { targetType: reportTarget.type, target: reportTarget.target, reason, details })
      closeReport(); setReason(''); setDetails('')
      showToast('Report sent. Thank you for helping keep Luma safe.')
    } catch (error) { showToast(errorMessage(error)) } finally { setBusy(false) }
  }
  return <Modal title={`Report ${reportTarget.label}`} eyebrow="Help us understand" onClose={closeReport} className="modal-sm">
    <form onSubmit={submit} className="modal-body form-stack">
      <div className="notice"><Flag size={18} /><p>Your report is confidential and goes to the Luma review team.</p></div>
      <fieldset><legend className="field-label">Select a reason</legend><div className="radio-list">{reasons.map(item => <label key={item} className={`radio-option ${reason === item ? 'selected' : ''}`}><input type="radio" name="reason" value={item} checked={reason === item} onChange={() => setReason(item)} />{item}</label>)}</div></fieldset>
      <label className="field"><span className="field-label">Additional details {reason === 'Something else' && '(required)'}</span><textarea value={details} onChange={event => setDetails(event.target.value.slice(0, 1000))} placeholder="Add context that may help the review team…" rows={4} required={reason === 'Something else'} /></label>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={closeReport}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit report'}</button></div>
    </form>
  </Modal>
}

// ---- StoryViewer ----
function StoryViewer() {
  const { stories, storyIndex, closeStory, openStory, openReport, openCreate, refreshStories, me, showToast } = useSocial()
  const [paused, setPaused] = useState(false)
  const [reply, setReply] = useState('')
  const [liked, setLiked] = useState(false)
  const [viewers, setViewers] = useState<number | null>(null)
  const story = storyIndex !== null ? stories[storyIndex] : undefined
  const storyId = story?.id
  const isVideo = story?.kind === 'video'
  const mine = !!story && story.user.id === me?.id

  const next = useCallback(() => {
    if (storyIndex === null) return
    if (storyIndex >= stories.length - 1) closeStory(); else openStory(storyIndex + 1)
  }, [storyIndex, stories.length, closeStory, openStory])
  const previous = useCallback(() => { if (storyIndex !== null && storyIndex > 0) openStory(storyIndex - 1) }, [storyIndex, openStory])

  // reset per-story state, count the view (not for my own stories), load "seen by" for my own
  useEffect(() => {
    if (!storyId) return
    setLiked(false); setReply(''); setViewers(null)
    if (mine) api.get<{ count: number }>(`${endpoints.stories}/${storyId}/viewers`).then(res => setViewers(res.count)).catch(() => {})
    else api.post(`${endpoints.stories}/${storyId}/view`).catch(() => {})
  }, [storyId, mine])

  // images advance after 5s; videos advance when they end
  useEffect(() => {
    if (!storyId || paused || isVideo) return
    const timer = window.setTimeout(next, 5000)
    return () => window.clearTimeout(timer)
  }, [storyId, paused, isVideo, next])

  useEffect(() => {
    if (storyIndex === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeStory()
      if (event.key === 'ArrowRight') next()
      if (event.key === 'ArrowLeft') previous()
      if (event.key === ' ' && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); setPaused(value => !value) }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [storyIndex, closeStory, next, previous])

  if (storyIndex === null || !story) return null

  const group = stories.filter(item => item.user.id === story.user.id)
  const position = group.findIndex(item => item.id === story.id)

  const sendDirect = async (text: string) => {
    const started = await api.post<{ conversation: Conversation }>(endpoints.conversations, { username: story.user.username })
    await api.post(`${endpoints.conversations}/${started.conversation.id}/messages`, { text })
  }
  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = reply.trim()
    if (!text) return
    try { await sendDirect(text); setReply(''); showToast(`Reply sent to ${story.user.username}.`) } catch (reason) { showToast(errorMessage(reason)) }
  }
  const react = async () => {
    if (liked) return
    setLiked(true)
    try { await sendDirect('❤️'); showToast('Reaction sent.') } catch (reason) { setLiked(false); showToast(errorMessage(reason)) }
  }
  const remove = async () => {
    try {
      await api.del(`${endpoints.stories}/${story.id}`)
      closeStory(); await refreshStories(); showToast('Story deleted.')
    } catch (reason) { showToast(errorMessage(reason)) }
  }

  return <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`${story.user.username}'s story`}>
    <div className="story-viewer-top"><button onClick={closeStory} aria-label="Close story and return home"><Brand inverse /></button><button className="story-close" type="button" onClick={closeStory} aria-label="Close story"><X size={25} /></button></div>
    <div className="story-stage">
      <button type="button" className="story-nav story-prev" onClick={previous} disabled={storyIndex <= 0} aria-label="Previous story"><ChevronLeft size={23} /></button>
      <div className="story-frame">
        <div className="story-progress">{group.map((item, index) => <span key={item.id}><i className={index < position ? 'complete' : index === position ? `current ${paused ? 'paused' : ''}` : ''} /></span>)}</div>
        <header className="story-header"><div><Avatar user={story.user} size="sm" /><strong>{story.user.username}</strong><span>{story.time}</span>{story.closeFriends && <span className="close-friends-label">Close friends</span>}</div><div><button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play story' : 'Pause story'}>{paused ? <Play size={20} /> : <Pause size={20} />}</button><details className="story-menu"><summary aria-label="Story options"><MoreHorizontal size={22} /></summary><div>{mine ? <><button onClick={() => { closeStory(); openCreate('story') }}>Add to story</button><button onClick={remove}>Delete story</button></> : <button onClick={() => { closeStory(); openReport({ type: 'story', target: story.id, label: `story by ${story.user.username}` }) }}>Report</button>}</div></details></div></header>
        {isVideo ? <video key={story.id} className="story-image" src={story.video} autoPlay playsInline controls={false} muted={false} onEnded={next} onClick={() => setPaused(value => !value)} /> : <img key={story.id} className="story-image" src={story.image} alt={`${story.user.name}'s story`} />}
        {mine ? <div className="story-seen"><Eye size={16} />{viewers === null ? '…' : `Seen by ${viewers}`}</div> : <form className="story-reply" onSubmit={submitReply}><input value={reply} onChange={event => setReply(event.target.value.slice(0, 500))} placeholder={`Reply to ${story.user.username}…`} aria-label="Reply to story" /><button type="button" className={liked ? 'liked' : ''} onClick={react} aria-label="React to story"><Heart size={23} fill={liked ? 'currentColor' : 'none'} /></button><button type="submit" aria-label="Send story reply" disabled={!reply.trim()}><Send size={22} /></button></form>}
      </div>
      <button type="button" className="story-nav story-next" onClick={next} aria-label="Next story"><ChevronRight size={23} /></button>
    </div>
  </div>
}

// ---- CreatePost ----
const MAX_IMAGES = 10

function CreatePost() {
  const { createMode, closeCreate, notifyFeedChanged, refreshStories, me, showToast } = useSocial()
  const [step, setStep] = useState<'media' | 'details'>('media')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const previewsRef = useRef<string[]>([])
  const [active, setActive] = useState(0)
  const [caption, setCaption] = useState('')
  const [location, setLocation] = useState('')
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => { previewsRef.current = previews }, [previews])
  useEffect(() => () => previewsRef.current.forEach(url => URL.revokeObjectURL(url)), [])
  if (!createMode || !me) return null
  const isStory = createMode === 'story'
  const isVideo = (index: number) => files[index]?.type.startsWith('video/')

  const resetAndClose = () => {
    previews.forEach(url => URL.revokeObjectURL(url))
    setStep('media'); setFiles([]); setPreviews([]); setCaption(''); setLocation(''); setActive(0); setCloseFriendsOnly(false)
    closeCreate()
  }
  const selectFiles = (list: FileList | null) => {
    if (!list?.length) return
    const chosen = Array.from(list).filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'))
    if (!chosen.length) { showToast('Choose image or video files only.'); return }
    const video = chosen.find(file => file.type.startsWith('video/'))
    if (isStory || video) {
      // a story, or a video post, holds exactly one file
      previews.forEach(url => URL.revokeObjectURL(url))
      const one = video ?? chosen[0]
      setFiles([one]); setPreviews([URL.createObjectURL(one)]); setActive(0)
      if (video && !isStory) showToast('Video posts hold one video.')
      return
    }
    if (files.some(file => file.type.startsWith('video/'))) { showToast('Remove the video first to add photos.'); return }
    const room = chosen.slice(0, MAX_IMAGES - files.length)
    if (room.length < chosen.length) showToast(`You can add up to ${MAX_IMAGES} photos.`)
    setFiles(previous => [...previous, ...room]); setPreviews(previous => [...previous, ...room.map(file => URL.createObjectURL(file))])
  }
  const removeActive = () => {
    URL.revokeObjectURL(previews[active])
    const nextFiles = files.filter((_, index) => index !== active)
    setFiles(nextFiles); setPreviews(previews.filter((_, index) => index !== active)); setActive(0)
    if (!nextFiles.length) setStep('media')
  }
  const saveDraft = () => {
    localStorage.setItem('luma-draft', JSON.stringify({ caption, location, savedAt: new Date().toISOString() }))
    showToast('Draft text saved in this browser.')
  }

  const publishPost = async () => {
    if (!files.length) { showToast('Add a photo or video first.'); return }
    setBusy(true)
    try {
      const mediaIds: string[] = []
      for (const file of files) mediaIds.push((await api.upload(file)).id)
      await api.post(endpoints.posts, { mediaIds, caption, location })
      notifyFeedChanged()
      resetAndClose()
      showToast('Your post is live.')
    } catch (reason) { showToast(errorMessage(reason)) } finally { setBusy(false) }
  }
  const publishStory = async () => {
    if (!files.length) { showToast('Choose a photo or video first.'); return }
    setBusy(true)
    try {
      const uploaded = await api.upload(files[0])
      await api.post(endpoints.stories, { mediaId: uploaded.id, closeFriends: closeFriendsOnly })
      await refreshStories()
      resetAndClose()
      showToast('Story shared. It disappears after 24 hours.')
    } catch (reason) { showToast(errorMessage(reason)) } finally { setBusy(false) }
  }

  const input = <input ref={fileInput} type="file" accept="image/*,video/*" multiple={!isStory} hidden onChange={event => { selectFiles(event.target.files); event.target.value = '' }} />

  return <Modal title={isStory ? 'Create story' : step === 'details' ? 'Finish your post' : 'Create new post'} eyebrow="Share with Luma" onClose={resetAndClose} className="create-modal">
    {isStory ? <div className="story-composer">
      {previews.length ? <div className="editor-preview story-media-preview" style={{ aspectRatio: '9 / 16', maxHeight: '55vh' }}>{isVideo(0) ? <video src={previews[0]} controls playsInline /> : <img src={previews[0]} alt="Story preview" />}<button type="button" className="remove-media" onClick={removeActive} aria-label="Remove selected media"><X size={17} /></button></div>
        : <button type="button" className="media-upload-row" onClick={() => fileInput.current?.click()}><ImagePlus size={21} /><span><strong>Add photo or video</strong><small>Choose from your device</small></span><ChevronRight size={18} /></button>}
      {input}
      <label className="terms-check"><input type="checkbox" checked={closeFriendsOnly} onChange={event => setCloseFriendsOnly(event.target.checked)} /><span>Share with Close Friends only</span></label>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={resetAndClose}>Cancel</button><button type="button" className="button button-primary" disabled={!files.length || busy} onClick={publishStory}>{busy ? 'Sharing…' : 'Share story'}</button></div>
    </div> : <>
      <div className="create-topbar">{step === 'details' && <button type="button" className="text-button with-icon" onClick={() => setStep('media')}><ArrowLeft size={16} />Back</button>}<span>{previews.length ? `${previews.length} item${previews.length > 1 ? 's' : ''} selected` : 'Photos and videos'}</span>{step === 'media' && previews.length > 0 && <button type="button" className="text-button" onClick={() => setStep('details')}>Next <ChevronRight size={15} /></button>}</div>
      <div className={`create-workspace ${step === 'details' ? 'show-details' : ''}`}>
        <div className="create-editor">
          {!previews.length ? <button type="button" className="upload-dropzone" onClick={() => fileInput.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); selectFiles(event.dataTransfer.files) }}><span className="upload-illustration"><FileImage size={35} strokeWidth={1.3} /></span><h3>Bring your moment here</h3><p>Drag photos or videos, or choose from your device.</p><span className="button button-primary"><Upload size={16} />Select media</span><small>JPG, PNG, WEBP, GIF, MP4, MOV · up to {MAX_IMAGES} photos or 1 video</small></button> : <>
            <div className="editor-preview" style={{ aspectRatio: '1 / 1' }}>{isVideo(active) ? <video src={previews[active]} controls playsInline /> : <img src={previews[active]} alt="Selected media preview" />}<button type="button" className="remove-media" onClick={removeActive} aria-label="Remove selected media"><X size={17} /></button></div>
            <div className="editor-toolbar"><div>{!isVideo(0) && files.length < MAX_IMAGES && <button type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={17} />Add</button>}</div><div className="thumbnail-strip">{previews.map((url, index) => <button type="button" key={url} className={index === active ? 'active' : ''} onClick={() => setActive(index)}>{isVideo(index) ? <video src={url} muted /> : <img src={url} alt={`Media ${index + 1}`} />}</button>)}</div></div>
          </>}
          {input}
        </div>
        {step === 'details' && <div className="post-details">
          <div className="details-profile"><Avatar user={me} size="sm" /><div><strong>{me.username}</strong><span>New post</span></div></div>
          <label className="caption-field"><textarea value={caption} onChange={event => setCaption(event.target.value.slice(0, 2200))} placeholder="Write a caption… Add #hashtags." rows={5} /><span>{caption.length}/2,200</span></label>
          <button type="button" className="emoji-caption" onClick={() => setCaption(caption + ' ✨')}><Smile size={18} />Add a little sparkle</button>
          <label className="details-input"><MapPin size={18} /><input value={location} onChange={event => setLocation(event.target.value.slice(0, 100))} placeholder="Add location" /></label>
          <div className="publish-note"><Check size={17} /><p>Your photos and videos are uploaded and saved to your Luma account when you share.</p></div>
        </div>}
      </div>
      <div className="create-footer"><button type="button" className="button button-ghost" onClick={saveDraft}>Save draft</button><div><button type="button" className="button button-secondary" onClick={resetAndClose}>Cancel</button>{step === 'details' && <button type="button" className="button button-primary" disabled={busy} onClick={publishPost}>{busy ? 'Sharing…' : 'Share'}</button>}</div></div>
    </>}
  </Modal>
}


// ========================================================================
// PAGES
// ========================================================================

// ---- Auth ----
type AuthView = 'login' | 'signup' | 'verify' | 'forgot' | 'reset' | 'photo'
const emptyOtp = () => ['', '', '', '', '', '']
const looksLikeContact = (value: string) => value.includes('@') || /^\+?[\d\s\-().]{7,}$/.test(value.trim())

function Auth() {
  const { navigate, setSession, theme, toggleTheme, showToast } = useSocial()
  const [view, setView] = useState<AuthView>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [login, setLogin] = useState({ identity: '', password: '' })
  const [signup, setSignup] = useState({ name: '', username: '', contact: '', password: '' })
  const [contact, setContact] = useState('') // where the code was / will be sent
  const [purpose, setPurpose] = useState<'signup' | 'reset'>('signup')
  const [otp, setOtp] = useState(emptyOtp)
  const [resetToken, setResetToken] = useState('')
  const [reset, setReset] = useState({ password: '', confirm: '' })
  const [usernameNote, setUsernameNote] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photo, setPhoto] = useState('')
  const [pendingUser, setPendingUser] = useState<Me | null>(null)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const photoRef = useRef<HTMLInputElement>(null)
  const target = contact.trim()

  const runRequest = async (callback: () => Promise<void>) => {
    setError(''); setBusy(true)
    try { await callback() } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) }
  }
  const enterApp = (user: Me) => { setSession(user); navigate('home') }

  const submitLogin = (event: React.FormEvent) => {
    event.preventDefault()
    runRequest(async () => {
      try {
        const res = await api.post<{ user: Me }>(endpoints.login, login)
        enterApp(res.user)
      } catch (reason) {
        if (reason instanceof ApiError && reason.code === 'NOT_VERIFIED') {
          // the server already sent a fresh code to the account's email/phone
          setContact(looksLikeContact(login.identity) ? login.identity.trim() : '')
          setPurpose('signup'); setOtp(emptyOtp()); setView('verify'); setError(reason.message)
          return
        }
        throw reason
      }
    })
  }
  const submitSignup = (event: React.FormEvent) => {
    event.preventDefault()
    if (signup.password.length < 10) { setError('Use at least 10 characters for your password.'); return }
    runRequest(async () => {
      const res = await api.post<{ requiresVerification: boolean; contact?: string; user?: Me }>(endpoints.signup, signup)
      if (res.requiresVerification) {
        setContact(res.contact ?? signup.contact.trim()); setPurpose('signup'); setOtp(emptyOtp()); setView('verify')
      } else if (res.user) { setPendingUser(res.user); setView('photo') }
    })
  }
  const checkUsername = () => {
    if (signup.username.length < 3) { setUsernameNote('Use at least 3 characters.'); return }
    setUsernameNote('Checking…')
    api.get<{ available: boolean; reason?: string }>(`${endpoints.usernameAvailability}?username=${encodeURIComponent(signup.username)}`)
      .then(result => setUsernameNote(result.available ? 'Username is available.' : result.reason ?? 'That username is already taken.'))
      .catch(() => setUsernameNote(''))
  }
  const updateOtp = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]; next[index] = digit; setOtp(next)
    if (digit && index < 5) otpRefs.current[index + 1]?.focus()
  }
  const verify = (event: React.FormEvent) => {
    event.preventDefault()
    if (!target) { setError('Enter the email or phone the code was sent to.'); return }
    if (otp.some(value => !value)) { setError('Enter all six digits.'); return }
    runRequest(async () => {
      if (purpose === 'signup') {
        const res = await api.post<{ user: Me }>(endpoints.verifyOtp, { contact: target, code: otp.join(''), purpose })
        setPendingUser(res.user); setView('photo')
      } else {
        const res = await api.post<{ resetToken: string }>(endpoints.verifyOtp, { contact: target, code: otp.join(''), purpose })
        setResetToken(res.resetToken); setView('reset')
      }
    })
  }
  const resend = () => {
    if (!target) { setError('Enter your email or phone first.'); return }
    runRequest(async () => { await api.post(endpoints.requestOtp, { contact: target, purpose }); showToast('If that account exists, a new code is on its way.') })
  }
  const requestReset = (event: React.FormEvent) => {
    event.preventDefault()
    runRequest(async () => {
      await api.post(endpoints.requestOtp, { contact: target, purpose: 'reset' })
      setPurpose('reset'); setOtp(emptyOtp()); setView('verify')
    })
  }
  const submitReset = (event: React.FormEvent) => {
    event.preventDefault()
    if (reset.password.length < 10) { setError('Use at least 10 characters.'); return }
    if (reset.password !== reset.confirm) { setError('Passwords do not match.'); return }
    runRequest(async () => {
      await api.post(endpoints.resetPassword, { resetToken, password: reset.password })
      setReset({ password: '', confirm: '' }); setResetToken(''); setView('login')
      showToast('Password updated. Log in with your new password.')
    })
  }
  const finishPhoto = () => runRequest(async () => {
    let user = pendingUser
    if (photoFile) {
      const uploaded = await api.upload(photoFile)
      user = (await api.patch<{ user: Me }>(endpoints.me, { avatarMediaId: uploaded.id })).user
    }
    if (!user) user = (await api.get<{ user: Me | null }>(endpoints.session)).user
    if (!user) throw new Error('Please log in again.')
    enterApp(user)
  })
  const skipPhoto = () => runRequest(async () => {
    const user = pendingUser ?? (await api.get<{ user: Me | null }>(endpoints.session)).user
    if (!user) throw new Error('Please log in again.')
    enterApp(user)
  })

  const title = view === 'login' ? 'Welcome back.' : view === 'signup' ? 'Create your space.' : view === 'verify' ? 'Check your inbox.' : view === 'forgot' ? 'Reset your password.' : view === 'reset' ? 'Choose a new password.' : 'Put a face to the name.'
  const subtitle = view === 'login' ? 'Good to see you again. Your people and moments are waiting.' : view === 'signup' ? 'A thoughtful corner of the internet, made for your everyday.' : view === 'verify' ? 'Enter the six-digit verification code to continue.' : view === 'forgot' ? 'Enter your email and we’ll send you a reset code.' : view === 'reset' ? 'Use a strong password you don’t use anywhere else.' : 'Add a profile photo so friends can recognize you.'
  const goBack = () => { setView(view === 'verify' ? (purpose === 'signup' ? 'signup' : 'forgot') : 'login'); setError('') }

  return <div className="auth-page">
    <section className="auth-visual"><img src={`${import.meta.env.BASE_URL}media/portrait-coast.webp`} alt="A person enjoying a quiet coastal sunset" /><div className="auth-visual-shade" /><div className="auth-visual-top"><Brand inverse /><span>SOCIAL, AT YOUR PACE</span></div><div className="auth-quote"><p>“A place for the moments<br />you <em>actually</em> want to keep.”</p><div><span className="quote-line" /><span>Made for real life, not endless noise.</span></div></div><div className="auth-image-meta"><span>51.5072° N</span><span>LUMA / 001</span></div></section>
    <section className="auth-form-side"><div className="auth-form-top"><span /><button type="button" className="icon-button" onClick={toggleTheme} aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button></div>
      <div className="auth-form-wrap">
        {view !== 'login' && view !== 'photo' && <button type="button" className="auth-back" onClick={goBack}><ArrowLeft size={17} />Back</button>}
        <div className="auth-heading"><p className="eyebrow">{view === 'login' ? 'YOUR MOMENTS, YOUR PEOPLE' : view === 'photo' ? 'ONE LAST TOUCH' : 'JOIN LUMA'}</p><h1>{title}</h1><p>{subtitle}</p></div>
        {error && <div className="form-message error" role="alert">{error}</div>}

        {view === 'login' && <form className="auth-form" onSubmit={submitLogin}><label className="field"><span className="field-label">Username, email, or phone</span><div className="input-with-icon"><UserRound size={18} /><input required autoComplete="username" value={login.identity} onChange={event => setLogin({ ...login, identity: event.target.value })} placeholder="you@example.com" /></div></label><label className="field"><span className="field-label">Password <button type="button" onClick={() => { setView('forgot'); setError('') }}>Forgot password?</button></span><div className="input-with-icon"><Lock size={18} /><input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={login.password} onChange={event => setLogin({ ...login, password: event.target.value })} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? <span className="loading-spinner" /> : 'Log in'}<ArrowRight size={18} /></button><p className="auth-switch">New to Luma? <button type="button" onClick={() => { setView('signup'); setError('') }}>Create an account</button></p></form>}

        {view === 'signup' && <form className="auth-form" onSubmit={submitSignup}><label className="field"><span className="field-label">Full name</span><input required autoComplete="name" value={signup.name} onChange={event => setSignup({ ...signup, name: event.target.value })} placeholder="Your full name" /></label><label className="field"><span className="field-label">Username</span><input required autoComplete="username" value={signup.username} onChange={event => { setSignup({ ...signup, username: event.target.value.replace(/\s/g, '').toLowerCase() }); setUsernameNote('') }} onBlur={checkUsername} placeholder="Choose something unique" /><small className="field-hint">{usernameNote}</small></label><label className="field"><span className="field-label">Email or phone</span><div className="input-with-icon"><Mail size={18} /><input required autoComplete="email" value={signup.contact} onChange={event => setSignup({ ...signup, contact: event.target.value })} placeholder="you@example.com" /></div></label><label className="field"><span className="field-label">Password</span><div className="input-with-icon"><Lock size={18} /><input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={signup.password} onChange={event => setSignup({ ...signup, password: event.target.value })} placeholder="At least 10 characters" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><label className="terms-check"><input required type="checkbox" /><span>I agree to the Terms and Privacy Policy.</span></label><button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? <span className="loading-spinner" /> : 'Create account'}<ArrowRight size={18} /></button><p className="auth-switch">Already have an account? <button type="button" onClick={() => { setView('login'); setError('') }}>Log in</button></p></form>}

        {view === 'verify' && <form className="auth-form" onSubmit={verify}>{target ? <div className="contact-verification"><Mail size={21} /><div><strong>{purpose === 'reset' ? 'Password reset code' : 'Verification required'}</strong><span>{target}</span></div><button type="button" onClick={goBack}>Edit</button></div> : <label className="field"><span className="field-label">Email or phone the code was sent to</span><div className="input-with-icon"><Mail size={18} /><input value={contact} onChange={event => setContact(event.target.value)} placeholder="you@example.com" /></div></label>}<div className="otp-fields" onPaste={event => { const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split(''); if (digits.length) { event.preventDefault(); setOtp(Array.from({ length: 6 }, (_, index) => digits[index] ?? '')); otpRefs.current[Math.min(digits.length, 5)]?.focus() } }}>{otp.map((value, index) => <input key={index} ref={element => { otpRefs.current[index] = element }} value={value} onChange={event => updateOtp(index, event.target.value)} onKeyDown={event => { if (event.key === 'Backspace' && !value && index > 0) otpRefs.current[index - 1]?.focus() }} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} aria-label={`Digit ${index + 1}`} />)}</div><button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? <span className="loading-spinner" /> : 'Verify code'}<ArrowRight size={18} /></button><button type="button" className="text-button" onClick={resend} disabled={busy}>Resend code</button></form>}

        {view === 'forgot' && <form className="auth-form" onSubmit={requestReset}><label className="field"><span className="field-label">Email or phone</span><div className="input-with-icon"><Phone size={18} /><input required value={contact} onChange={event => setContact(event.target.value)} placeholder="Where should we contact you?" /></div></label><div className="notice"><Shield size={18} /><p>We’ll send a six-digit code. It expires in 10 minutes and works once.</p></div><button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? <span className="loading-spinner" /> : 'Send reset code'}<ArrowRight size={18} /></button></form>}

        {view === 'reset' && <form className="auth-form" onSubmit={submitReset}><label className="field"><span className="field-label">New password</span><input required type="password" autoComplete="new-password" value={reset.password} onChange={event => setReset({ ...reset, password: event.target.value })} /></label><label className="field"><span className="field-label">Confirm new password</span><input required type="password" autoComplete="new-password" value={reset.confirm} onChange={event => setReset({ ...reset, confirm: event.target.value })} /></label><button type="submit" className="button button-primary auth-submit" disabled={busy}>{busy ? <span className="loading-spinner" /> : 'Update password'}<ArrowRight size={18} /></button></form>}

        {view === 'photo' && <div className="auth-form"><div className="photo-setup"><button type="button" className="photo-setup-preview" onClick={() => photoRef.current?.click()} aria-label="Choose profile photo">{photo ? <img src={photo} alt="Profile preview" /> : <><Camera size={28} /><span>Add photo</span></>}</button><input ref={photoRef} hidden type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) { setPhotoFile(file); setPhoto(URL.createObjectURL(file)) } }} /><p>Choose a clear photo of yourself, or skip for now.</p></div><button type="button" className="button button-primary auth-submit" disabled={busy} onClick={finishPhoto}>{busy ? <span className="loading-spinner" /> : photoFile ? 'Save photo and continue' : 'Continue'}<ArrowRight size={18} /></button><button type="button" className="text-button" disabled={busy} onClick={skipPhoto}>Skip for now</button></div>}

        <div className="auth-security-note"><Lock size={13} /><span>Secure session · No auth secrets stored in your browser</span></div>
      </div>
      <div className="auth-footer"><span>© 2026 Luma</span></div>
    </section>
  </div>
}

// ---- Feed ----
function Feed() {
  const { me, stories, openStory, openCreate, viewProfile, following, toggleFollow, feedVersion } = useSocial()
  const [posts, setPosts] = useState<Post[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [discover, setDiscover] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<User[]>([])
  const sentinel = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  const fetchPage = useCallback(async (from: string | null) => {
    if (busy.current) return
    busy.current = true; setLoading(true); setError('')
    try {
      const res = await api.get<{ posts: Post[]; nextCursor: string | null; discover: boolean }>(`${endpoints.feed}?limit=10${from ? `&cursor=${from}` : ''}`)
      setPosts(previous => from ? [...previous, ...res.posts.filter(post => !previous.some(item => item.id === post.id))] : res.posts)
      setCursor(res.nextCursor); setDiscover(res.discover)
    } catch (reason) { setError(errorMessage(reason)) } finally { busy.current = false; setLoading(false) }
  }, [])

  useEffect(() => { fetchPage(null) }, [fetchPage, feedVersion])
  useEffect(() => {
    api.get<{ users: User[] }>(`${endpoints.suggestions}?limit=5`).then(res => setSuggestions(res.users)).catch(() => {})
  }, [feedVersion])
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting && cursor) fetchPage(cursor) }, { rootMargin: '300px' })
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [cursor, fetchPage])

  // one bubble per person: my own first, then everyone else in the order the server sent them
  const groups = useMemo(() => {
    const map = new Map<string, { user: User; indices: number[]; allSeen: boolean }>()
    stories.forEach((story, index) => {
      const group = map.get(story.user.id) ?? { user: story.user, indices: [], allSeen: true }
      group.indices.push(index); group.allSeen = group.allSeen && story.seen
      map.set(story.user.id, group)
    })
    const entryPoint = (indices: number[]) => indices.find(index => !stories[index].seen) ?? indices[0]
    return [...map.values()].map(group => ({ ...group, start: entryPoint(group.indices) }))
  }, [stories])
  if (!me) return null
  const own = groups.find(group => group.user.id === me.id)
  const others = groups.filter(group => group.user.id !== me.id)

  return <div className="feed-layout page-enter">
    <section className="feed-column" aria-label="Home feed">
      <div className="stories-wrap">
        <div className="stories" role="list" aria-label="Stories">
          <button type="button" className="story-item" onClick={() => own ? openStory(own.start) : openCreate('story')} role="listitem">
            <span className={`story-avatar ${own ? '' : 'own-story'}`}><Avatar user={me} size="lg" />{!own && <span className="story-plus"><Plus size={12} strokeWidth={3} /></span>}</span>
            <span>Your story</span>
          </button>
          {own && <button type="button" className="story-item" onClick={() => openCreate('story')} role="listitem"><span className="story-avatar own-story"><span className="avatar avatar-lg add-story-circle"><Plus size={22} /></span></span><span>Add story</span></button>}
          {others.map(group => <button type="button" className="story-item" key={group.user.id} onClick={() => openStory(group.start)} role="listitem">
            <span className="story-avatar"><Avatar user={group.user} size="lg" /></span>
            <span>{group.user.username.split('.')[0]}</span>
          </button>)}
        </div>
      </div>

      <button type="button" className="quick-create" onClick={() => openCreate('post')}>
        <Avatar user={me} size="sm" /><span>Share a moment, {me.name.split(' ')[0]}…</span><ImagePlus size={21} />
      </button>

      {discover && posts.length > 0 && <div className="notice feed-note"><p>You’re not following anyone yet, so here’s what people are sharing. Follow accounts to build your own feed.</p></div>}
      {error && <div className="form-message error" role="alert">{error} <button type="button" className="text-button" onClick={() => fetchPage(null)}>Try again</button></div>}
      <div className="feed-list">{posts.map(post => <PostCard key={post.id} post={post} onDeleted={id => setPosts(previous => previous.filter(item => item.id !== id))} />)}</div>
      <div ref={sentinel} className="feed-sentinel">{loading ? <><span className="loading-spinner" /><p>Loading moments…</p></> : posts.length === 0 && !error ? <><span className="caught-up-icon"><ImagePlus size={20} /></span><h3>Nothing here yet</h3><p>Share your first moment or follow people to fill your feed.</p><button className="text-button" type="button" onClick={() => openCreate('post')}>Create a post</button></> : !cursor && posts.length > 0 ? <><span className="caught-up-icon"><Check size={20} /></span><h3>You’re all caught up</h3><p>New posts from the people you follow will appear here.</p><button className="text-button" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button></> : null}</div>
    </section>

    <aside className="feed-right-rail">
      <div className="current-profile"><Avatar user={me} size="md" onClick={() => viewProfile(me)} /><div><button type="button" onClick={() => viewProfile(me)}>{me.username}</button><span>{me.name}</span></div></div>
      {suggestions.length > 0 && <><div className="rail-section-heading"><h2>Suggested for you</h2></div>
      <div className="suggestions">{suggestions.map(user => <div className="suggestion" key={user.id}><Avatar user={user} size="sm" onClick={() => viewProfile(user)} /><div><button type="button" onClick={() => viewProfile(user)}>{user.username}</button><span>{user.name}</span></div><button type="button" className={`text-button ${following.has(user.username) ? 'muted-button' : ''}`} onClick={() => toggleFollow(user.username)}>{following.has(user.username) ? 'Following' : 'Follow'}</button></div>)}</div></>}
      <footer className="rail-footer"><p>© 2026 LUMA SOCIAL</p></footer>
    </aside>
  </div>
}

// ---- Explore ----
const categories = ['For you', 'Accounts', 'Reels', 'Tags'] as const
const HISTORY_KEY = 'luma-search-history'
const readHistory = (): string[] => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] } }

function Explore() {
  const { viewProfile, following, toggleFollow, openPost, showToast } = useSocial()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState<typeof categories[number]>('For you')
  const [history, setHistory] = useState<string[]>(readHistory)
  const [grid, setGrid] = useState<GridItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [found, setFound] = useState<GridItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 350); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)) }, [history])

  useEffect(() => {
    let cancelled = false
    const fail = (reason: unknown) => { if (!cancelled) showToast(errorMessage(reason)) }
    setLoading(true)
    const finish = () => { if (!cancelled) setLoading(false) }
    if (category === 'Reels') {
      api.get<{ reels: Reel[] }>(`${endpoints.reels}?limit=18`)
        .then(res => { if (!cancelled) { setGrid(res.reels.map(reel => ({ id: reel.id, type: 'video' as const, image: reel.poster, video: reel.video, likes: reel.likes, commentsCount: reel.comments }))); setHasMore(false); setPage(1) } })
        .catch(fail).finally(finish)
    } else if (!debounced) {
      if (category === 'Accounts') {
        api.get<{ users: User[] }>(`${endpoints.suggestions}?limit=15`).then(res => { if (!cancelled) setUsers(res.users) }).catch(fail).finally(finish)
      } else if (category === 'For you') {
        api.get<{ items: GridItem[]; hasMore: boolean }>(`${endpoints.explore}?page=1&limit=24`)
          .then(res => { if (!cancelled) { setGrid(res.items); setHasMore(res.hasMore); setPage(1) } }).catch(fail).finally(finish)
      } else { setLoading(false) }
    } else {
      const q = category === 'Tags' ? `#${debounced.replace(/^#/, '')}` : debounced
      api.get<{ users: User[]; posts: GridItem[] }>(`${endpoints.search}?q=${encodeURIComponent(q)}`)
        .then(res => { if (!cancelled) { setUsers(res.users); setFound(res.posts) } }).catch(fail).finally(finish)
    }
    return () => { cancelled = true }
  }, [category, debounced, showToast])

  const loadMore = async () => {
    try {
      const res = await api.get<{ items: GridItem[]; hasMore: boolean }>(`${endpoints.explore}?page=${page + 1}&limit=24`)
      setGrid(previous => [...previous, ...res.items.filter(item => !previous.some(p => p.id === item.id))]); setHasMore(res.hasMore); setPage(page + 1)
    } catch (reason) { showToast(errorMessage(reason)) }
  }
  const remember = () => { if (query.trim()) setHistory(items => [query.trim(), ...items.filter(item => item !== query.trim())].slice(0, 5)) }

  const searching = debounced.length > 0 && category !== 'Reels'
  const showUsers = category === 'Accounts' || (searching && category === 'For you')
  const showFoundPosts = searching && (category === 'Tags' || debounced.startsWith('#'))
  const tiles: GridItem[] = category === 'Reels' ? grid : showFoundPosts ? found : !searching && category === 'For you' ? grid : []
  const tilesTitle = category === 'Reels' ? 'Reels worth watching' : showFoundPosts ? `Results for “${debounced}”` : 'Today’s visual edit'
  const showTiles = category === 'Reels' || showFoundPosts || (!searching && category === 'For you')

  return <div className="explore-page page-enter">
    <header className="page-heading explore-heading"><div><p className="eyebrow">DISCOVER SOMETHING NEW</p><h1>Explore</h1></div></header>
    <form className="explore-search" onSubmit={event => { event.preventDefault(); remember(); setDebounced(query.trim()) }}><Search size={21} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people or #hashtags" aria-label="Search" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={18} /></button>}<button type="submit" className="search-submit">Search</button></form>
    <div className="search-categories" role="tablist">{categories.map(item => <button type="button" role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item === 'Accounts' && <UserRound size={15} />}{item === 'Reels' && <Clapperboard size={15} />}{item === 'Tags' && <Hash size={15} />}{item === 'For you' && <Compass size={15} />}{item}</button>)}</div>

    {!query && category === 'For you' && history.length > 0 && <section className="search-history"><div><h2>Recent searches</h2><button type="button" onClick={() => setHistory([])}>Clear all</button></div><div className="history-chips">{history.map(item => <button type="button" key={item} onClick={() => setQuery(item)}><Search size={14} />{item}<span onClick={event => { event.stopPropagation(); setHistory(items => items.filter(value => value !== item)) }} aria-label={`Remove ${item}`}><X size={13} /></span></button>)}</div></section>}
    {category === 'Tags' && !searching && <p className="empty-copy">Type a hashtag, like “travel”, to see posts that use it.</p>}

    {showUsers && (users.length > 0 || loading) && <section className="account-results"><div className="section-title"><h2>{searching ? 'Accounts' : 'Suggested accounts'}</h2><span>{users.length} results</span></div>{users.map(user => <div className="account-result" key={user.id}><Avatar user={user} size="md" onClick={() => viewProfile(user)} /><div><button type="button" onClick={() => viewProfile(user)}>{user.username}{user.verified && <span className="verified"><Check size={10} /></span>}</button><strong>{user.name}</strong><span>{user.bio}</span></div><button type="button" className={`button ${following.has(user.username) ? 'button-secondary' : 'button-primary'} button-small`} onClick={() => toggleFollow(user.username)}>{following.has(user.username) ? 'Following' : 'Follow'}</button></div>)}</section>}
    {showUsers && !loading && users.length === 0 && (searching || category === 'Accounts') && <p className="empty-copy">{searching ? `No accounts found for “${debounced}”.` : 'No suggestions right now.'}</p>}

    {showTiles && <section className="explore-content"><div className="section-title"><h2>{tilesTitle}</h2><span>{tiles.length} posts</span></div>
      {loading && tiles.length === 0 ? <div className="viewer-loading"><span className="loading-spinner" /></div> : tiles.length === 0 ? <p className="empty-copy">{searching ? 'No posts found.' : 'Nothing to show yet. Be the first to share something.'}</p> :
      <div className="explore-grid">{tiles.map((item, index) => <button type="button" className={`explore-tile ${index === 0 || index === 5 ? 'tile-tall' : ''}`} key={item.id} onClick={() => openPost(item.id)} aria-label={`Open post ${index + 1}`}><MediaThumb image={item.image} video={item.video} alt={`Post ${index + 1}`} /><span className="tile-overlay"><span><Heart size={18} fill="currentColor" />{item.likes ?? 0}</span><span><MessageCircle size={18} fill="currentColor" />{item.commentsCount ?? 0}</span></span>{item.type === 'video' && <Clapperboard className="tile-type" size={19} />}</button>)}</div>}
      {category === 'For you' && !searching && hasMore && <button type="button" className="button button-secondary load-more" onClick={loadMore}>Load more discoveries</button>}
    </section>}
  </div>
}

// ---- Reels ----
function Reels() {
  const { me, viewProfile, following, toggleFollow, openReport, openCreate, openPost, showToast } = useSocial()
  const [reels, setReels] = useState<Reel[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  const [buffering, setBuffering] = useState(true)
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const busy = useRef(false)
  const autoplay = me?.settings.autoplay !== false
  const reel = reels[active]

  const load = useCallback(async (from: string | null) => {
    if (busy.current) return
    busy.current = true; setLoading(true)
    try {
      const res = await api.get<{ reels: Reel[]; nextCursor: string | null }>(`${endpoints.reels}?limit=8${from ? `&cursor=${from}` : ''}`)
      setReels(previous => from ? [...previous, ...res.reels.filter(item => !previous.some(p => p.id === item.id))] : res.reels)
      setCursor(res.nextCursor)
    } catch (reason) { showToast(errorMessage(reason)) } finally { busy.current = false; setLoading(false) }
  }, [showToast])
  useEffect(() => { load(null) }, [load])

  const move = (direction: number) => {
    const next = Math.max(0, Math.min(reels.length - 1, active + direction))
    if (next === active) return
    videoRefs.current[active]?.pause()
    setActive(next); setPlaying(true); setBuffering(true)
    if (next >= reels.length - 2 && cursor) load(cursor)
  }
  const togglePlay = () => {
    const video = videoRefs.current[active]
    if (!video) return
    if (video.paused) { video.play().catch(() => {}); setPlaying(true) } else { video.pause(); setPlaying(false) }
  }
  const patch = (id: string, change: Partial<Reel>) => setReels(items => items.map(item => item.id === id ? { ...item, ...change } : item))
  const like = async (item: Reel) => {
    patch(item.id, { liked: !item.liked, likes: Math.max(0, item.likes + (item.liked ? -1 : 1)) })
    try {
      const res = item.liked ? await api.del<{ liked: boolean; likes: number }>(`${endpoints.posts}/${item.id}/like`) : await api.post<{ liked: boolean; likes: number }>(`${endpoints.posts}/${item.id}/like`)
      patch(item.id, { liked: res.liked, likes: res.likes })
    } catch (reason) { patch(item.id, { liked: item.liked, likes: item.likes }); showToast(errorMessage(reason)) }
  }
  const save = async (item: Reel) => {
    patch(item.id, { saved: !item.saved })
    try { if (item.saved) await api.del(`${endpoints.posts}/${item.id}/save`); else await api.post(`${endpoints.posts}/${item.id}/save`) } catch (reason) { patch(item.id, { saved: item.saved }); showToast(errorMessage(reason)) }
  }
  const share = async (item: Reel) => {
    const url = `${window.location.origin}${window.location.pathname}#/home?post=${item.id}`
    try { await navigator.clipboard.writeText(url); showToast('Reel link copied.') } catch { showToast('Reel link: ' + url) }
  }

  return <div className="reels-page page-enter" onKeyDown={event => { if (event.key === 'ArrowDown') move(1); if (event.key === 'ArrowUp') move(-1) }} tabIndex={0}>
    <div className="reels-topline"><div><p className="eyebrow">SHORT FORM / BIG STORIES</p><h1>Reels</h1></div><button type="button" className="button button-secondary" onClick={() => openCreate('post')}>Upload reel</button></div>
    {!reel ? <div className="empty-state">{loading ? <span className="loading-spinner" /> : <><span><Play size={27} /></span><h2>No reels yet</h2><p>Video posts show up here. Share a video to start the first reel.</p><button type="button" className="button button-secondary" onClick={() => openCreate('post')}>Upload a video</button></>}</div> :
    <div className="reel-stage">
      <div className="reel-phone">
        <video key={reel.id} ref={element => { videoRefs.current[active] = element }} src={reel.video} poster={reel.poster || undefined} autoPlay={autoplay} muted={muted} loop playsInline onCanPlay={() => setBuffering(false)} onPlay={() => setPlaying(true)} onWaiting={() => setBuffering(true)} onClick={togglePlay} aria-label={reel.caption} />
        <div className="reel-shade" />
        {buffering && autoplay && <div className="reel-buffer"><span className="loading-spinner" /><span>Buffering video…</span></div>}
        {(!playing || !autoplay) && !buffering && <button type="button" className="reel-big-play" onClick={togglePlay} aria-label="Play reel"><Play size={32} fill="currentColor" /></button>}
        <div className="reel-header"><span>Reels</span><div><button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute reel' : 'Mute reel'}>{muted ? <VolumeX size={21} /> : <Volume2 size={21} />}</button><button type="button" onClick={togglePlay} aria-label={playing ? 'Pause reel' : 'Play reel'}>{playing ? <Pause size={21} /> : <Play size={21} />}</button></div></div>
        <div className="reel-caption"><div className="reel-author"><Avatar user={reel.user} size="sm" onClick={() => viewProfile(reel.user)} /><button type="button" onClick={() => viewProfile(reel.user)}>{reel.user.username}</button>{reel.user.verified && <span className="verified"><Check size={10} /></span>}{reel.user.id !== me?.id && <button type="button" className="reel-follow" onClick={() => toggleFollow(reel.user.username)}>{following.has(reel.user.username) ? 'Following' : 'Follow'}</button>}</div><p>{reel.caption}</p><button type="button" className="reel-audio" onClick={() => showToast(`Audio: ${reel.audio}`)}><Music2 size={15} /><span>{reel.audio}</span></button></div>
        <div className="reel-actions"><button type="button" className={reel.liked ? 'liked' : ''} onClick={() => like(reel)}><Heart size={26} fill={reel.liked ? 'currentColor' : 'none'} /><span>{reel.likes.toLocaleString()}</span></button><button type="button" onClick={() => openPost(reel.id)}><MessageCircle size={26} /><span>{reel.comments.toLocaleString()}</span></button><button type="button" onClick={() => share(reel)}><Send size={25} /><span>Share</span></button><button type="button" className={reel.saved ? 'saved' : ''} onClick={() => save(reel)}><Bookmark size={25} fill={reel.saved ? 'currentColor' : 'none'} /><span>Save</span></button>{reel.user.id !== me?.id && <details className="reel-menu"><summary aria-label="Reel options"><MoreHorizontal size={25} /></summary><div><button onClick={() => openReport({ type: 'post', target: reel.id, label: `reel by ${reel.user.username}` })}>Report</button></div></details>}<Avatar user={reel.user} size="xs" /></div>
        <div className="reel-progress"><span style={{ width: `${((active + 1) / reels.length) * 100}%` }} /></div>
      </div>
      <div className="reel-pagination"><span>{String(active + 1).padStart(2, '0')} <i>/ {String(reels.length).padStart(2, '0')}{cursor ? '+' : ''}</i></span><button type="button" onClick={() => move(1)} disabled={active === reels.length - 1} aria-label="Next reel"><ChevronDown size={23} /></button><small>USE THE ARROW BUTTON OR KEYS</small></div>
    </div>}
  </div>
}

// ---- Messages ----
type MessagePage = { messages: Message[]; hasMore: boolean }
const byRecent = (a: Conversation, b: Conversation) => b.lastMessageAt.localeCompare(a.lastMessageAt)

function Messages() {
  const { viewProfile, openReport, pendingChat, clearPendingChat, refreshCounts, showToast } = useSocial()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatQuery, setNewChatQuery] = useState('')
  const [newChatResults, setNewChatResults] = useState<User[]>([])
  const [searchChat, setSearchChat] = useState(false)
  const [chatQuery, setChatQuery] = useState('')
  const messagesRef = useRef<Message[]>([])
  const bodyRef = useRef<HTMLDivElement>(null)
  const selected = conversations.find(item => item.id === selectedId) ?? null
  const filtered = useMemo(() => conversations.filter(item => `${item.user.name} ${item.user.username}`.toLowerCase().includes(query.toLowerCase())), [conversations, query])

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { const body = bodyRef.current; if (body) body.scrollTop = body.scrollHeight }, [messages.length, selectedId])

  const loadInbox = useCallback(async () => {
    try {
      const res = await api.get<{ conversations: Conversation[] }>(endpoints.conversations)
      // keep chats I just started that have no message yet (the server only lists chats with messages)
      setConversations(previous => [...previous.filter(item => !item.lastMessage && !res.conversations.some(c => c.id === item.id)), ...res.conversations])
    } catch (reason) { showToast(errorMessage(reason)) } finally { setLoadingInbox(false) }
  }, [showToast])
  useEffect(() => {
    loadInbox()
    const timer = window.setInterval(loadInbox, 15000)
    return () => window.clearInterval(timer)
  }, [loadInbox])

  const openChat = useCallback(async (id: string) => {
    setSelectedId(id); setChatOpen(true); setSearchChat(false); setChatQuery(''); setMessages([]); setHasMore(false); setLoadingMessages(true)
    try {
      const res = await api.get<MessagePage>(`${endpoints.conversations}/${id}/messages?limit=50`)
      setMessages(res.messages); setHasMore(res.hasMore)
      setConversations(items => items.map(item => item.id === id ? { ...item, unread: 0 } : item))
      refreshCounts()
    } catch (reason) { showToast(errorMessage(reason)) } finally { setLoadingMessages(false) }
  }, [refreshCounts, showToast])

  // opened from a profile ("Message" button)
  useEffect(() => {
    if (!pendingChat) return
    setConversations(items => items.some(item => item.id === pendingChat.id) ? items : [pendingChat, ...items])
    openChat(pendingChat.id)
    clearPendingChat()
  }, [pendingChat, openChat, clearPendingChat])

  // no websockets yet: ask for new messages every few seconds while a chat is open
  useEffect(() => {
    if (!selectedId) return
    const timer = window.setInterval(async () => {
      const last = messagesRef.current[messagesRef.current.length - 1]
      try {
        const res = await api.get<MessagePage>(`${endpoints.conversations}/${selectedId}/messages?limit=50${last ? `&after=${last.id}` : ''}`)
        if (!res.messages.length) return
        setMessages(previous => last ? [...previous, ...res.messages.filter(item => !previous.some(p => p.id === item.id))] : res.messages)
      } catch { /* try again on the next tick */ }
    }, 4000)
    return () => window.clearInterval(timer)
  }, [selectedId])

  useEffect(() => {
    if (!newChatOpen || !newChatQuery.trim()) { setNewChatResults([]); return }
    let cancelled = false
    const timer = window.setTimeout(() => {
      api.get<{ users: User[] }>(`${endpoints.search}?q=${encodeURIComponent(newChatQuery.trim())}`).then(res => { if (!cancelled) setNewChatResults(res.users) }).catch(() => {})
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [newChatOpen, newChatQuery])

  const startChat = async (user: User) => {
    try {
      const res = await api.post<{ conversation: Conversation }>(endpoints.conversations, { username: user.username })
      setConversations(items => items.some(item => item.id === res.conversation.id) ? items : [res.conversation, ...items])
      setNewChatOpen(false); setNewChatQuery('')
      openChat(res.conversation.id)
    } catch (reason) { showToast(errorMessage(reason)) }
  }
  const loadEarlier = async () => {
    if (!selectedId || !messages.length) return
    try {
      const res = await api.get<MessagePage>(`${endpoints.conversations}/${selectedId}/messages?limit=50&before=${messages[0].id}`)
      setMessages(previous => [...res.messages, ...previous]); setHasMore(res.hasMore)
    } catch (reason) { showToast(errorMessage(reason)) }
  }
  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = message.trim()
    if (!text || !selected || sending) return
    setSending(true)
    try {
      const res = await api.post<{ message: Message }>(`${endpoints.conversations}/${selected.id}/messages`, { text })
      setMessages(previous => [...previous, res.message]); setMessage('')
      setConversations(items => items.map(item => item.id === selected.id ? { ...item, lastMessage: text, lastSender: 'me' as const, time: 'now', lastMessageAt: res.message.createdAt } : item).sort(byRecent))
    } catch (reason) { showToast(errorMessage(reason)) } finally { setSending(false) }
  }
  const react = async (item: Message) => {
    if (!selected || item.deleted) return
    try {
      const res = await api.put<{ message: Message }>(`${endpoints.conversations}/${selected.id}/messages/${item.id}/reaction`, { emoji: item.reaction ? '' : '❤️' })
      setMessages(previous => previous.map(m => m.id === item.id ? res.message : m))
    } catch (reason) { showToast(errorMessage(reason)) }
  }
  const remove = async (item: Message) => {
    if (!selected) return
    try {
      const res = await api.del<{ message: Message }>(`${endpoints.conversations}/${selected.id}/messages/${item.id}`)
      setMessages(previous => previous.map(m => m.id === item.id ? res.message : m))
    } catch (reason) { showToast(errorMessage(reason)) }
  }
  const visibleMessages = messages.filter(item => !chatQuery || item.text.toLowerCase().includes(chatQuery.toLowerCase()))

  return <div className={`messages-page page-enter ${chatOpen ? 'chat-open' : ''}`}>
    <aside className="inbox-panel">
      <div className="inbox-heading"><div><p className="eyebrow">YOUR SPACE</p><h1>Messages</h1></div><button type="button" className="icon-button bordered" onClick={() => setNewChatOpen(!newChatOpen)} aria-label="New message"><SquarePen size={19} /></button></div>
      {newChatOpen && <div className="new-chat"><label className="inbox-search"><Search size={18} /><input autoFocus value={newChatQuery} onChange={event => setNewChatQuery(event.target.value)} placeholder="Find someone to message" /></label>{newChatResults.map(user => <button type="button" key={user.id} className="conversation" onClick={() => startChat(user)}><span className="conversation-avatar"><Avatar user={user} size="md" /></span><span className="conversation-copy"><strong>{user.name}</strong><span>@{user.username}</span></span></button>)}{newChatQuery.trim() && !newChatResults.length && <p className="empty-copy">No people found.</p>}</div>}
      <label className="inbox-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search conversations" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear inbox search"><X size={15} /></button>}</label>
      <div className="conversation-list">{filtered.length ? filtered.map(conversation => <button type="button" key={conversation.id} className={`conversation ${selectedId === conversation.id ? 'active' : ''}`} onClick={() => openChat(conversation.id)}><span className="conversation-avatar"><Avatar user={conversation.user} size="md" />{conversation.user.online && <i />}</span><span className="conversation-copy"><strong>{conversation.user.name}</strong><span>{conversation.lastMessage ? `${conversation.lastSender === 'me' ? 'You: ' : ''}${conversation.lastMessage} · ${conversation.time}` : 'Say hello 👋'}</span></span>{conversation.unread > 0 && <span className="unread-count">{conversation.unread}</span>}</button>) : loadingInbox ? <div className="inbox-empty"><span className="loading-spinner" /></div> : <div className="inbox-empty"><MessageCircle size={25} /><h3>{query ? 'No conversations found' : 'No messages yet'}</h3><p>{query ? 'Try another name or username.' : 'Tap the pencil to start a conversation.'}</p></div>}</div>
    </aside>

    <section className="chat-panel" aria-label={selected ? `Conversation with ${selected.user.name}` : 'Conversation'}>
      {!selected ? <div className="empty-state"><span><MessageCircle size={27} /></span><h2>Your messages</h2><p>Pick a conversation from the list, or start a new one.</p></div> : <>
      <header className="chat-header"><button type="button" className="icon-button chat-back" onClick={() => setChatOpen(false)} aria-label="Back to conversations"><ArrowLeft size={21} /></button><button type="button" className="chat-person" onClick={() => viewProfile(selected.user)}><Avatar user={selected.user} size="sm" /><span><strong>{selected.user.name}</strong><small>{selected.user.online ? 'Active now' : 'Away'}</small></span></button><div className="chat-header-actions"><details className="action-menu"><summary className="icon-button" aria-label="Conversation options"><MoreHorizontal size={21} /></summary><div className="action-popover chat-options"><button type="button" onClick={() => viewProfile(selected.user)}>View profile</button><button type="button" onClick={() => setSearchChat(!searchChat)}>Search in conversation</button><button type="button" className="danger-text" onClick={() => openReport({ type: 'user', target: selected.user.username, label: selected.user.username })}>Report</button></div></details></div></header>
      {searchChat && <div className="chat-search"><Search size={17} /><input autoFocus value={chatQuery} onChange={event => setChatQuery(event.target.value)} placeholder="Search this conversation" /><button type="button" onClick={() => { setSearchChat(false); setChatQuery('') }} aria-label="Close conversation search"><X size={17} /></button></div>}
      <div className="chat-body" ref={bodyRef}><div className="chat-intro"><Avatar user={selected.user} size="xl" /><h3>{selected.user.name}</h3><p>@{selected.user.username} · Luma member</p><button type="button" className="button button-secondary button-small" onClick={() => viewProfile(selected.user)}>View profile</button></div>
        {hasMore && <button type="button" className="text-button load-older" onClick={loadEarlier}>Load earlier messages</button>}
        {visibleMessages.length ? visibleMessages.map(item => <div key={item.id} className={`message-row ${item.from === 'me' ? 'mine' : ''}`}>{item.from === 'them' && <Avatar user={selected.user} size="xs" />}<div className="message-bubble" onDoubleClick={() => react(item)} title={item.deleted ? undefined : 'Double-click to react'}>{item.deleted ? <em className="message-deleted">Message deleted</em> : item.text}{item.reaction && <span className="message-reaction">{item.reaction}</span>}<small>{item.time}</small>{item.from === 'me' && !item.deleted && <button type="button" className="msg-delete" onClick={() => remove(item)} aria-label="Delete message"><Trash2 size={12} /></button>}</div></div>) : loadingMessages ? <div className="no-messages"><span className="loading-spinner" /></div> : <div className="no-messages"><Search size={22} /><p>{chatQuery ? 'No messages match your search.' : 'No messages here yet. Say hello!'}</p></div>}</div>
      <div className="chat-composer-wrap"><form className="chat-composer" onSubmit={send}><button type="button" onClick={() => setMessage(message + ' ✨')} aria-label="Add emoji"><Smile size={21} /></button><input value={message} onChange={event => setMessage(event.target.value.slice(0, 2000))} placeholder="Message…" aria-label="Message" /><button type="submit" className="send-message" disabled={!message.trim() || sending} aria-label="Send message"><Send size={19} /></button></form></div></>}
    </section>
  </div>
}

// ---- Notifications ----
const icons = { like: Heart, comment: MessageCircle, follow: UserPlus }
const describe = (item: NotificationItem) => item.type === 'like' ? 'liked your post.' : item.type === 'follow' ? 'started following you.' : `commented: “${item.text}”`

function Notifications() {
  const { viewProfile, openPost, following, toggleFollow, refreshCounts, showToast } = useSocial()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const load = useCallback(async (before: string | null) => {
    setLoading(true)
    try {
      const res = await api.get<{ notifications: NotificationItem[]; nextCursor: string | null }>(`${endpoints.notifications}?limit=30${before ? `&before=${encodeURIComponent(before)}` : ''}`)
      setItems(previous => before ? [...previous, ...res.notifications] : res.notifications)
      setNextCursor(res.nextCursor)
    } catch (reason) { showToast(errorMessage(reason)) } finally { setLoading(false) }
  }, [showToast])
  useEffect(() => { load(null) }, [load])

  const open = async (item: NotificationItem) => {
    if (!item.read) {
      setItems(values => values.map(value => value.id === item.id ? { ...value, read: true } : value))
      api.post(`${endpoints.notifications}/${item.id}/read`).then(refreshCounts).catch(() => {})
    }
    if (item.type !== 'follow' && item.post) openPost(item.post.id); else viewProfile(item.user)
  }
  const markAll = async () => {
    try {
      await api.post(`${endpoints.notifications}/read`)
      setItems(values => values.map(value => ({ ...value, read: true }))); refreshCounts()
    } catch (reason) { showToast(errorMessage(reason)) }
  }
  const unread = items.filter(item => !item.read).length
  const visible = filter === 'all' ? items : items.filter(item => !item.read)

  return <div className="notifications-page page-enter"><header className="page-heading"><div><p className="eyebrow">STAY IN THE LOOP</p><h1>Notifications</h1></div></header>
    <div className="notification-toolbar"><div className="segmented"><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All activity</button><button type="button" className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Unread {unread > 0 && <span>{unread}</span>}</button></div><button type="button" className="text-button with-icon" onClick={markAll} disabled={unread === 0}><CheckCheck size={16} />Mark all read</button></div>
    <section className="notification-list">{visible.length ? visible.map(item => { const Icon = icons[item.type]; return <div key={item.id} className={`notification-item ${!item.read ? 'unread' : ''}`}><button type="button" className="notification-main" onClick={() => open(item)}><span className="notification-avatar"><Avatar user={item.user} size="md" /><i className={`notification-type type-${item.type}`}><Icon size={12} /></i></span><span className="notification-copy"><span><strong>{item.user.username}</strong> {describe(item)}</span><small>{item.time} ago</small></span></button><div className="notification-action">{item.type === 'follow' ? <button type="button" className={`button button-small ${following.has(item.user.username) ? 'button-secondary' : 'button-primary'}`} onClick={() => toggleFollow(item.user.username)}>{following.has(item.user.username) ? 'Following' : 'Follow back'}</button> : item.post ? <button type="button" className="notification-thumb" onClick={() => open(item)}><MediaThumb image={item.post.image} video={item.post.video} alt="Related post" /></button> : null}</div></div> }) : loading ? <div className="viewer-loading"><span className="loading-spinner" /></div> : <div className="empty-state"><span><Bell size={27} /></span><h2>{filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}</h2><p>You’re all caught up. New likes, comments, and followers will appear here.</p>{filter === 'unread' && <button type="button" className="button button-secondary" onClick={() => setFilter('all')}>View all activity</button>}</div>}</section>
    {nextCursor && <button type="button" className="button button-secondary load-more" onClick={() => load(nextCursor)} disabled={loading}>Load older</button>}
  </div>
}

// ---- Profile ----
type Connection = User & { isFollowing: boolean }

function Profile() {
  const { me, setSession, profileUsername, viewProfile, following, toggleFollow, navigate, openCreate, openReport, openPost, openChatWith, showToast } = useSocial()
  const username = profileUsername ?? me?.username ?? ''
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [notFound, setNotFound] = useState('')
  const [tab, setTab] = useState<'posts' | 'reels'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [connections, setConnections] = useState<'followers' | 'following' | null>(null)
  const [people, setPeople] = useState<Connection[]>([])
  const [peopleCursor, setPeopleCursor] = useState<string | null>(null)
  const [peopleSearch, setPeopleSearch] = useState('')
  const [form, setForm] = useState({ name: '', username: '', bio: '' })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const own = !!me && username === me.username

  const loadProfile = useCallback(async () => {
    if (!username) return
    try {
      const res = await api.get<{ user: ProfileData }>(`${endpoints.users}/${encodeURIComponent(username)}`)
      setProfile(res.user); setNotFound('')
    } catch (reason) { setProfile(null); setNotFound(errorMessage(reason)) }
  }, [username])
  useEffect(() => { setProfile(null); setTab('posts'); loadProfile() }, [loadProfile])

  const loadPosts = useCallback(async (from: string | null) => {
    if (!username) return
    setLoadingPosts(true)
    try {
      const res = await api.get<{ posts: Post[]; nextCursor: string | null }>(`${endpoints.users}/${encodeURIComponent(username)}/posts?limit=12${tab === 'reels' ? '&type=video' : ''}${from ? `&cursor=${from}` : ''}`)
      setPosts(previous => from ? [...previous, ...res.posts] : res.posts); setCursor(res.nextCursor)
    } catch (reason) { showToast(errorMessage(reason)) } finally { setLoadingPosts(false) }
  }, [username, tab, showToast])
  useEffect(() => { setPosts([]); setCursor(null); loadPosts(null) }, [loadPosts])

  const loadPeople = useCallback(async (kind: 'followers' | 'following', from: string | null) => {
    try {
      const res = await api.get<{ users: Connection[]; nextCursor: string | null }>(`${endpoints.users}/${encodeURIComponent(username)}/${kind}?limit=30${from ? `&cursor=${from}` : ''}`)
      setPeople(previous => from ? [...previous, ...res.users] : res.users); setPeopleCursor(res.nextCursor)
    } catch (reason) { showToast(errorMessage(reason)) }
  }, [username, showToast])
  const openConnections = (kind: 'followers' | 'following') => { setConnections(kind); setPeople([]); setPeopleCursor(null); setPeopleSearch(''); loadPeople(kind, null) }
  const shownPeople = useMemo(() => people.filter(user => `${user.name} ${user.username}`.toLowerCase().includes(peopleSearch.toLowerCase())), [people, peopleSearch])

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/profile`
    try { await navigator.clipboard.writeText(url); showToast('Profile link copied.') } catch { showToast('Copy this link: ' + url) }
  }
  const follow = async () => { await toggleFollow(username); loadProfile() }
  const startEdit = () => {
    if (!me) return
    setForm({ name: me.name, username: me.username, bio: me.bio ?? '' }); setAvatarFile(null); setAvatarPreview(''); setEditOpen(true)
  }
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const body: Record<string, string> = { name: form.name, username: form.username, bio: form.bio }
      if (avatarFile) body.avatarMediaId = (await api.upload(avatarFile)).id
      const res = await api.patch<{ user: Me }>(endpoints.me, body)
      setSession(res.user); setEditOpen(false); showToast('Profile updated.')
      if (res.user.username !== username) viewProfile(res.user); else loadProfile()
    } catch (reason) { showToast(errorMessage(reason)) } finally { setSaving(false) }
  }

  if (!me) return null
  if (!profile) return <div className="profile-page page-enter">{notFound ? <div className="empty-state"><h2>Profile unavailable</h2><p>{notFound}</p><button type="button" className="button button-secondary" onClick={() => viewProfile(me)}>Go to my profile</button></div> : <div className="viewer-loading"><span className="loading-spinner" /></div>}</div>
  const isFollowing = following.has(profile.username)

  return <div className="profile-page page-enter">
    <section className="profile-hero">
      <div className="profile-avatar-wrap"><Avatar user={own ? me : profile} size="xl" />{own && <button type="button" onClick={startEdit} aria-label="Change profile photo"><Camera size={17} /></button>}</div>
      <div className="profile-identity"><div className="profile-name-line"><h1>{profile.username}</h1>{profile.verified && <span className="verified verified-large"><Check size={13} /></span>}{!own && <span className="profile-online">{profile.online ? 'Active now' : 'Recently active'}</span>}</div><h2>{profile.name}</h2>{profile.bio && <p>{profile.bio}</p>}{profile.followsYou && !own && <p className="follows-you">Follows you</p>}</div>
      <div className="profile-actions">{own ? <><button type="button" className="button button-secondary" onClick={startEdit}>Edit profile</button><button type="button" className="button button-secondary" onClick={() => openCreate('story')}><Plus size={17} />Add story</button><button type="button" className="button button-secondary" onClick={() => navigate('settings')}><SettingsIcon size={17} />Settings</button><button type="button" className="icon-button bordered" onClick={share} aria-label="Share profile"><Share2 size={19} /></button></> : <><button type="button" className={`button ${isFollowing ? 'button-secondary' : 'button-primary'}`} onClick={follow}>{isFollowing ? 'Following' : 'Follow'}</button><button type="button" className="button button-secondary" onClick={() => openChatWith(profile.username)}><MessageCircle size={17} />Message</button><details className="action-menu"><summary className="icon-button bordered" aria-label="Profile options"><MoreHorizontal size={20} /></summary><div className="action-popover"><button onClick={share}>Share profile</button><button className="danger-text" onClick={() => openReport({ type: 'user', target: profile.username, label: profile.username })}>Report</button></div></details></>}</div>
      <div className="profile-stats"><button type="button" onClick={() => setTab('posts')}><strong>{profile.posts.toLocaleString()}</strong><span>posts</span></button><button type="button" onClick={() => openConnections('followers')}><strong>{profile.followers.toLocaleString()}</strong><span>followers</span></button><button type="button" onClick={() => openConnections('following')}><strong>{profile.following.toLocaleString()}</strong><span>following</span></button></div>
    </section>

    <div className="profile-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}><Grid3X3 size={16} />Posts</button><button type="button" role="tab" aria-selected={tab === 'reels'} className={tab === 'reels' ? 'active' : ''} onClick={() => setTab('reels')}><Clapperboard size={17} />Reels</button></div>
    {posts.length ? <div className="profile-grid">{posts.map(post => <button type="button" key={post.id} onClick={() => openPost(post.id)} aria-label={`Open ${post.type} post`}><MediaThumb image={post.image} video={post.video} alt={post.caption || 'Post'} />{post.type === 'video' && <Clapperboard size={20} />}{post.type === 'carousel' && <span className="grid-stack-icon"><Grid3X3 size={16} /></span>}</button>)}</div> : loadingPosts ? <div className="viewer-loading"><span className="loading-spinner" /></div> : <div className="empty-state"><span>{tab === 'reels' ? <Clapperboard size={27} /> : <Camera size={27} />}</span><h2>{tab === 'reels' ? 'No reels yet' : 'No posts yet'}</h2><p>{own ? 'Share your first moment and it will show up here.' : `${profile.username} hasn’t shared anything yet.`}</p>{own && <button type="button" className="button button-secondary" onClick={() => openCreate('post')}>Create a post</button>}</div>}
    {cursor && <button type="button" className="button button-secondary load-more" onClick={() => loadPosts(cursor)} disabled={loadingPosts}>Load more</button>}

    {editOpen && <Modal title="Edit profile" eyebrow="Your public identity" onClose={() => setEditOpen(false)} className="modal-sm"><form className="modal-body form-stack" onSubmit={saveProfile}><div className="edit-avatar">{avatarPreview ? <span className="avatar avatar-xl"><img src={avatarPreview} alt="New profile" /></span> : <Avatar user={me} size="xl" />}<button type="button" className="button button-secondary button-small" onClick={() => avatarInput.current?.click()}><Camera size={16} />Change photo</button><input ref={avatarInput} hidden type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) { setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file)) } }} /></div><label className="field"><span className="field-label">Full name</span><input required maxLength={60} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label className="field"><span className="field-label">Username</span><input required minLength={3} maxLength={30} value={form.username} onChange={event => setForm({ ...form, username: event.target.value.replace(/\s/g, '').toLowerCase() })} /></label><label className="field"><span className="field-label">Bio</span><textarea rows={4} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value.slice(0, 160) })} /><small className="field-hint">{form.bio.length}/160</small></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setEditOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div></form></Modal>}

    {connections && <Modal title={connections === 'followers' ? 'Followers' : 'Following'} eyebrow={profile.username} onClose={() => setConnections(null)} className="modal-sm"><div className="modal-body"><label className="inbox-search"><Search size={17} /><input value={peopleSearch} onChange={event => setPeopleSearch(event.target.value)} placeholder={`Search ${connections}`} /></label><div className="connection-list">{shownPeople.map(user => <div key={user.id} className="connection-row"><Avatar user={user} size="sm" onClick={() => { setConnections(null); viewProfile(user) }} /><div><button type="button" onClick={() => { setConnections(null); viewProfile(user) }}>{user.username}</button><span>{user.name}</span></div>{user.id !== me.id && <button type="button" className={`button button-small ${following.has(user.username) ? 'button-secondary' : 'button-primary'}`} onClick={async () => { await toggleFollow(user.username); if (own) loadProfile() }}>{following.has(user.username) ? 'Following' : 'Follow'}</button>}</div>)}{!shownPeople.length && <p className="empty-copy">{people.length ? 'No matches.' : connections === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p>}</div>{peopleCursor && <button type="button" className="button button-secondary load-more" onClick={() => loadPeople(connections, peopleCursor)}>Load more</button>}</div></Modal>}
  </div>
}

// ---- Saved + Activity ----
function Saved() {
  const { openPost, showToast } = useSocial()
  const [posts, setPosts] = useState<Post[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async (from: string | null) => {
    setLoading(true)
    try {
      const res = await api.get<{ posts: Post[]; nextCursor: string | null }>(`${endpoints.saved}?limit=18${from ? `&cursor=${from}` : ''}`)
      setPosts(previous => from ? [...previous, ...res.posts] : res.posts); setCursor(res.nextCursor)
    } catch (reason) { showToast(errorMessage(reason)) } finally { setLoading(false) }
  }, [showToast])
  useEffect(() => { load(null) }, [load])
  return <div className="collection-page page-enter"><header className="page-heading"><div><p className="eyebrow">ONLY YOU CAN SEE THIS</p><h1>Saved</h1></div></header>
    {posts.length ? <div className="profile-grid">{posts.map(post => <button type="button" key={post.id} onClick={() => openPost(post.id)}><MediaThumb image={post.image} video={post.video} alt={post.caption || 'Saved post'} /></button>)}</div> : loading ? <div className="viewer-loading"><span className="loading-spinner" /></div> : <div className="empty-state"><span><Bookmark size={28} /></span><h2>Save what inspires you</h2><p>Bookmark posts and they’ll appear here, just for you.</p></div>}
    {cursor && <button type="button" className="button button-secondary load-more" onClick={() => load(cursor)} disabled={loading}>Load more</button>}
  </div>
}

function Activity() {
  const { openPost, showToast } = useSocial()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<{ items: ActivityItem[] }>(endpoints.activity).then(res => setItems(res.items)).catch(reason => showToast(errorMessage(reason))).finally(() => setLoading(false))
  }, [showToast])
  return <div className="activity-page page-enter"><header className="page-heading"><div><p className="eyebrow">YOUR SPACE, YOUR HISTORY</p><h1>Your activity</h1></div></header>
    <section className="notification-list">{items.length ? items.map(item => <div key={`${item.type}-${item.id}`} className="notification-item"><button type="button" className="notification-main" onClick={() => openPost(item.post.id)}><span className="notification-avatar"><span className="avatar avatar-md activity-icon">{item.type === 'like' ? <Heart size={18} /> : <MessageCircle size={18} />}</span></span><span className="notification-copy"><span>{item.type === 'like' ? 'You liked a post.' : `You commented: “${item.text}”`}</span><small>{item.time} ago</small></span></button><div className="notification-action"><button type="button" className="notification-thumb" onClick={() => openPost(item.post.id)}><MediaThumb image={item.post.image} video={item.post.video} alt="Post" /></button></div></div>) : loading ? <div className="viewer-loading"><span className="loading-spinner" /></div> : <div className="empty-state"><span><Heart size={27} /></span><h2>No activity yet</h2><p>Your recent likes and comments will show up here.</p></div>}</section>
  </div>
}

// ---- Settings ----
const sections = [
  { id: 'account', label: 'Account & personal info', icon: UserRound, group: 'Your account' },
  { id: 'security', label: 'Password & security', icon: Shield, group: 'Your account' },
  { id: 'story', label: 'Close Friends', icon: Users, group: 'Preferences' },
  { id: 'appearance', label: 'Appearance & playback', icon: Palette, group: 'Display' },
  { id: 'data', label: 'Data & account management', icon: Database, group: 'More' },
] as const
type SectionId = typeof sections[number]['id']

function CloseFriendsEditor({ me }: { me: Me }) {
  const { showToast } = useSocial()
  const [people, setPeople] = useState<User[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [friends, followingList] = await Promise.all([
        api.get<{ users: User[] }>(`${endpoints.me}/close-friends`),
        api.get<{ users: User[] }>(`${endpoints.users}/${me.username}/following?limit=50`),
      ])
      if (cancelled) return
      const merged = new Map<string, User>()
      ;[...friends.users, ...followingList.users].forEach(user => merged.set(user.username, user))
      setPeople([...merged.values()]); setSelected(new Set(friends.users.map(user => user.username)))
    })().catch(reason => showToast(errorMessage(reason))).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [me.username, showToast])

  const save = async () => {
    setSaving(true)
    try { await api.put(`${endpoints.me}/close-friends`, { usernames: [...selected] }); showToast('Close Friends list saved.') } catch (reason) { showToast(errorMessage(reason)) } finally { setSaving(false) }
  }
  return <><section className="close-friends-section"><div><h2>Close Friends</h2><p>Stories marked “Close Friends only” are visible just to these people. Pick from accounts you follow.</p></div>
    <div className="close-friends-list">{people.map(user => <button type="button" key={user.id} onClick={() => setSelected(previous => { const next = new Set(previous); if (next.has(user.username)) next.delete(user.username); else next.add(user.username); return next })}><Avatar user={user} size="sm" /><span><strong>{user.name}</strong><small>@{user.username}</small></span><span className={`select-circle ${selected.has(user.username) ? 'selected' : ''}`}>{selected.has(user.username) && <Check size={13} />}</span></button>)}{!people.length && <p className="empty-copy">{loading ? 'Loading…' : 'Follow some people first, then you can add them here.'}</p>}</div></section>
    <button type="button" className="button button-primary" onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save Close Friends'}</button></>
}

function Settings() {
  const { me, setSession, theme, toggleTheme, updateSettings, logout, showToast, navigate } = useSocial()
  const [active, setActive] = useState<SectionId>('account')
  const [mobileDetail, setMobileDetail] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: me?.name ?? '', username: me?.username ?? '', bio: me?.bio ?? '' })
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  if (!me) return null
  const current = sections.find(section => section.id === active)!
  const selectSection = (id: SectionId) => { setActive(id); setMobileDetail(true) }
  const run = async (task: () => Promise<void>) => { setBusy(true); try { await task() } catch (reason) { showToast(errorMessage(reason)) } finally { setBusy(false) } }

  const saveAccount = (event: React.FormEvent) => { event.preventDefault(); run(async () => {
    const res = await api.patch<{ user: Me }>(endpoints.me, profileForm)
    setSession(res.user); showToast('Account updated.')
  }) }
  const changePassword = (event: React.FormEvent) => { event.preventDefault()
    if (passwords.next.length < 10) { showToast('Use at least 10 characters for the new password.'); return }
    if (passwords.next !== passwords.confirm) { showToast('New passwords do not match.'); return }
    run(async () => { await api.post(`${endpoints.me}/password`, { current: passwords.current, next: passwords.next }); setPasswords({ current: '', next: '', confirm: '' }); showToast('Password changed. Other devices were signed out.') })
  }
  const exportData = () => run(async () => {
    const data = await api.get<unknown>(`${endpoints.me}/export`)
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'luma-data.json'; link.click(); URL.revokeObjectURL(url)
    showToast('Your data was downloaded.')
  })
  const deleteAccount = (event: React.FormEvent) => { event.preventDefault()
    if (deleteText !== 'DELETE') { showToast('Type DELETE to confirm.'); return }
    run(async () => { await api.del(endpoints.me, { password: deletePassword }); setDeleteOpen(false); await logout(); showToast('Your account was deleted.') })
  }
  const autoplay = me.settings.autoplay !== false
  const textSize = typeof me.settings.textSize === 'string' ? me.settings.textSize : 'default'

  const detail = () => {
    switch (active) {
      case 'account': return <>
        <div className="settings-profile-summary"><Avatar user={me} size="lg" /><div><strong>{me.name}</strong><span>@{me.username}</span></div><button type="button" className="button button-secondary button-small" onClick={() => navigate('profile')}>View profile</button></div>
        <form className="settings-form" onSubmit={saveAccount}><div className="form-grid"><label className="field"><span className="field-label">Full name</span><input required maxLength={60} value={profileForm.name} onChange={event => setProfileForm({ ...profileForm, name: event.target.value })} /></label><label className="field"><span className="field-label">Username</span><input required minLength={3} maxLength={30} value={profileForm.username} onChange={event => setProfileForm({ ...profileForm, username: event.target.value.replace(/\s/g, '').toLowerCase() })} /></label><label className="field"><span className="field-label">Email</span><input type="email" value={me.email ?? ''} placeholder="Not set" disabled /></label><label className="field"><span className="field-label">Phone</span><input type="tel" value={me.phone ?? ''} placeholder="Not set" disabled /></label></div><label className="field"><span className="field-label">Bio</span><textarea rows={3} value={profileForm.bio} onChange={event => setProfileForm({ ...profileForm, bio: event.target.value.slice(0, 160) })} /></label><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form>
        <div className="notice"><Shield size={18} /><p>Your email or phone is the contact you signed up with and can’t be edited here.</p></div>
      </>
      case 'security': return <>
        <form className="settings-form" onSubmit={changePassword}><h2>Change password</h2><label className="field"><span className="field-label">Current password</span><input required type="password" autoComplete="current-password" value={passwords.current} onChange={event => setPasswords({ ...passwords, current: event.target.value })} /></label><label className="field"><span className="field-label">New password</span><input required type="password" autoComplete="new-password" value={passwords.next} onChange={event => setPasswords({ ...passwords, next: event.target.value })} /><small className="field-hint">At least 10 characters.</small></label><label className="field"><span className="field-label">Confirm new password</span><input required type="password" autoComplete="new-password" value={passwords.confirm} onChange={event => setPasswords({ ...passwords, confirm: event.target.value })} /></label><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></form>
        <div className="settings-group"><SettingRow icon={LogOut} title="Log out of all devices" description="Ends every session, including this one" onClick={() => run(async () => { await api.post(endpoints.logoutAll); await logout() })} /></div>
      </>
      case 'story': return <CloseFriendsEditor me={me} />
      case 'appearance': return <>
        <h2>Choose your atmosphere</h2><p className="settings-intro">Saved to your account, so it follows you across devices.</p>
        <div className="theme-options"><button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => { if (theme !== 'light') toggleTheme() }}><div className="theme-preview theme-light"><span /><i /><i /></div><span><Sun size={18} />Light</span>{theme === 'light' && <Check size={18} />}</button><button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => { if (theme !== 'dark') toggleTheme() }}><div className="theme-preview theme-dark"><span /><i /><i /></div><span><Moon size={18} />Dark</span>{theme === 'dark' && <Check size={18} />}</button></div>
        <div className="setting-row settings-row-bordered"><span className="setting-copy"><strong>Reduce motion</strong><small>Minimize non-essential transitions and animations</small></span><Toggle checked={me.settings.reduceMotion === true} onChange={value => updateSettings({ reduceMotion: value })} label="Reduce motion" /></div>
        <div className="setting-row settings-row-bordered"><span className="setting-copy"><strong>Autoplay videos in Reels</strong><small>Turn off to save data</small></span><Toggle checked={autoplay} onChange={value => updateSettings({ autoplay: value })} label="Autoplay videos" /></div>
        <div className="settings-form"><label className="field"><span className="field-label">Text size</span><select value={textSize} onChange={event => updateSettings({ textSize: event.target.value })}><option value="small">Small</option><option value="default">Default</option><option value="large">Large</option></select></label></div>
      </>
      case 'data': return <>
        <div className="settings-group"><SettingRow icon={Download} title="Download your data" description="Your profile, posts, comments and who you follow, as JSON" onClick={exportData} /></div>
        <section className="danger-zone"><h2>Delete account</h2><p>This permanently removes your profile, posts, stories, messages and comments. It can’t be undone.</p><button type="button" className="button button-danger" onClick={() => setDeleteOpen(true)}>Delete my account</button></section>
      </>
    }
  }

  return <div className={`settings-page page-enter ${mobileDetail ? 'show-detail' : ''}`}>
    <aside className="settings-nav"><div className="settings-title"><p className="eyebrow">MAKE IT YOURS</p><h1>Settings</h1></div><div className="settings-nav-scroll">{Array.from(new Set(sections.map(section => section.group))).map(group => <section key={group}><h2>{group}</h2>{sections.filter(section => section.group === group).map(section => { const Icon = section.icon; return <button type="button" key={section.id} className={active === section.id ? 'active' : ''} onClick={() => selectSection(section.id)}><Icon size={18} /><span>{section.label}</span><ChevronRight size={15} /></button> })}</section>)}</div></aside>
    <section className="settings-detail"><header><button type="button" className="icon-button settings-back" onClick={() => setMobileDetail(false)} aria-label="Back to settings"><ArrowLeft size={21} /></button><div><p className="eyebrow">{current.group}</p><h1>{current.label}</h1></div></header><div className="settings-detail-body">{detail()}</div></section>

    {deleteOpen && <Modal title="Delete account?" eyebrow="Permanent action" onClose={() => setDeleteOpen(false)} className="modal-sm"><form className="modal-body form-stack" onSubmit={deleteAccount}><div className="notice danger-notice"><Trash2 size={18} /><p>Everything you’ve shared on Luma will be erased immediately.</p></div><label className="field"><span className="field-label">Your password</span><input required type="password" autoComplete="current-password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} /></label><label className="field"><span className="field-label">Type DELETE to continue</span><input value={deleteText} onChange={event => setDeleteText(event.target.value)} autoComplete="off" /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setDeleteOpen(false)}>Keep account</button><button type="submit" className="button button-danger" disabled={deleteText !== 'DELETE' || !deletePassword || busy}>{busy ? 'Deleting…' : 'Delete account'}</button></div></form></Modal>}
  </div>
}


// ========================================================================
// APP
// ========================================================================

function AppContent() {
  const { route, toast, me, authReady } = useSocial()
  const toastView = toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span></div>
  if (!authReady) return null // the splash screen covers this moment
  if (!me) return <><Auth />{toastView}</>
  const page = () => {
    switch (route) {
      case 'explore': return <Explore />
      case 'reels': return <Reels />
      case 'messages': return <Messages />
      case 'notifications': return <Notifications />
      case 'profile': return <Profile />
      case 'settings': return <Settings />
      case 'saved': return <Saved />
      case 'activity': return <Activity />
      default: return <Feed />
    }
  }
  return <><AppShell>{page()}</AppShell><StoryViewer /><CreatePost /><PostViewer /><ReportDialog />{toastView}</>
}

export default function App() {
  const [splash, setSplash] = useState(true)
  useEffect(() => { const timer = window.setTimeout(() => setSplash(false), 900); return () => window.clearTimeout(timer) }, [])
  return <SocialProvider>{splash && <div className="splash-screen" aria-label="Loading Luma"><div className="splash-center"><Brand inverse /><p>Keep the moments that move you.</p><span className="splash-loader"><i /></span></div><div className="splash-foot"><span>SOCIAL / AT YOUR PACE</span><span>LUMA © 2026</span></div></div>}<AppContent /></SocialProvider>
}
