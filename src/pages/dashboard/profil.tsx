import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IUserResponse, UserRole, CaisseType } from '@/types';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  PageHeader,
  PageContent,
  PageSkeleton,
  FormSection,
  FormRow,
} from '@/components/ui';
import {
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Shield,
  UserRound,
  Bell,
  Smartphone,
  Camera,
  Check,
  X,
} from 'lucide-react';


function roleColor(role: UserRole): string {
  const colors: Partial<Record<UserRole, string>> = {
    [UserRole.ADMIN]: 'bg-purple-100 text-purple-800 border-purple-200',
    [UserRole.ADMIN_TRANSIT]: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    [UserRole.AGENT_TRANSIT]: 'bg-blue-100 text-blue-800 border-blue-200',
    [UserRole.COMPTABLE]: 'bg-green-100 text-green-800 border-green-200',
    [UserRole.USER_PAYEUR]: 'bg-pink-100 text-pink-800 border-pink-200',
    [UserRole.CAISSIER]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };
  return colors[role] || 'bg-gray-100 text-gray-800 border-gray-200';
}

function initials(nom: string, email: string): string {
  const n = nom.trim() || email;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return n.slice(0, 2).toUpperCase();
}

// Password Field Component
function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
  autoComplete,
  show,
  onToggleShow,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          className="h-11 pe-12 font-mono text-sm tracking-wide"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute end-1 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={onToggleShow}
          aria-label={show ? t('dashboard.login.hidePassword') : t('dashboard.login.showPassword')}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Profile Info Card Component
function ProfileInfoCard({
  profile,
  loading,
}: {
  profile: IUserResponse | null;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const caisseTrans =
    profile?.caisse === CaisseType.TRANSIT
      ? t('dashboard.profil.caisseLabel.TRANSIT')
      : null;
  if (loading || !profile) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="h-24 w-24 animate-pulse rounded-full bg-muted" />
        <div className="w-full max-w-[200px] space-y-2">
          <div className="mx-auto h-6 w-36 animate-pulse rounded bg-muted" />
          <div className="mx-auto h-4 w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-6 text-center">
      {/* Avatar with upload hint */}
      <div className="group relative">
        <div
          className={cn(
            'flex h-24 w-24 items-center justify-center rounded-full',
            'bg-gradient-to-br from-[#02389B] to-[#012a73]',
            'text-2xl font-bold text-white shadow-lg',
            'ring-4 ring-white/50 dark:ring-white/10',
            'transition-transform duration-300 group-hover:scale-105'
          )}
        >
          {initials(profile.nom, profile.email)}
        </div>
        <button
          type="button"
          className={cn(
            'absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center',
            'rounded-full bg-white shadow-md',
            'border border-border/50',
            'transition-all duration-200 hover:scale-110 hover:shadow-lg',
            'dark:bg-card dark:border-border'
          )}
          title={t('dashboard.profil.passwordSection.changePhotoTitle')}
        >
          <Camera className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Name & Email */}
      <h2 className="mt-5 text-xl font-bold leading-tight text-foreground">
        {profile.nom}
      </h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Mail className="h-3.5 w-3.5" />
        {profile.email}
      </p>

      {/* Role Badges */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            'px-3 py-1 text-xs font-medium',
            roleColor(profile.role)
          )}
        >
          {t(`roles.${profile.role}`, { defaultValue: profile.role })}
        </Badge>
        {caisseTrans && (
          <Badge
            variant="outline"
            className="px-3 py-1 text-xs font-normal border-border/60"
          >
            {caisseTrans}
          </Badge>
        )}
      </div>

      <Separator className="my-5 w-full max-w-xs opacity-50" />

      {/* Member since */}
      <div className="flex items-center gap-2 text-left text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span>
          {t('dashboard.profil.memberSince')}{' '}
          <span className="font-medium text-foreground/80">
            {profile.createdAt
              ? new Date(profile.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : '—'}
          </span>
        </span>
      </div>

      {/* Last login info */}
      <div className="mt-3 flex items-center gap-2 text-left text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
        <span>
          {t('dashboard.profil.lastLogin')}:{' '}
          <span className="font-medium text-foreground/80">
            {profile.updatedAt
              ? new Date(profile.updatedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : t('dashboard.profil.today')}
          </span>
        </span>
      </div>
    </div>
  );
}

// Success Message Component
function SuccessMessage({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-emerald-200/80',
        'bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900',
        'dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100',
        'animate-in fade-in slide-in-from-top-2 duration-300'
      )}
      role="status"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function ProfilPage() {
  const { data: session, status, update } = useSession();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [profile, setProfile] = useState<IUserResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('compte');

  // Profile form state
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Load profile
  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.data) {
        const u = data.data as IUserResponse;
        setProfile(u);
        setNom(u.nom);
        setEmail(u.email);
        setTelephone(u.telephone || '');
      } else {
        setLoadError(data.error || t('dashboard.profil.loadProfileError'));
      }
    } catch {
      setLoadError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (status === 'authenticated') void loadProfile();
  }, [status, loadProfile]);

  // Save profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: nom.trim(),
          email: email.trim(),
          telephone: telephone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setProfileError(data.error || t('dashboard.profil.updateError'));
        return;
      }
      const u = data.data as IUserResponse;
      setProfile(u);
      setNom(u.nom);
      setEmail(u.email);
      setTelephone(u.telephone || '');
      setProfileMessage(t('dashboard.profil.compteSection.savedSuccess'));
      await update({ nom: u.nom, email: u.email });
    } catch {
      setProfileError(t('common.errorNetwork'));
    } finally {
      setSavingProfile(false);
    }
  };

  // Change password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (newPassword.length < 6) {
      setPasswordError(t('dashboard.profil.passwordSection.minLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('dashboard.profil.passwordSection.noMatch'));
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setPasswordError(data.error || t('dashboard.profil.passwordChangeError'));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(t('dashboard.profil.passwordSection.savedSuccess'));
    } catch {
      setPasswordError(t('common.errorNetwork'));
    } finally {
      setSavingPassword(false);
    }
  };

  if (status === 'loading' || !session?.user) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.profil.title')} />
        <PageContent>
          <div className="flex h-64 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-[#02389B]" />
          </div>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageContent padding={isMobile ? 'sm' : 'md'} className="max-w-full">
        {loadError ? (
          <Alert variant="destructive" className="max-w-2xl">
            <AlertTitle>{t('dashboard.profil.loadError')}</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : (
          <div
            className={cn(
              'overflow-hidden rounded-2xl max-w-full border border-border/60 bg-card shadow-sm',
              'dark:border-border/40'
            )}
          >
            <div className="flex flex-col lg:flex-row">
              {/* Sidebar - Profile Info */}
              <aside
                className={cn(
                  'border-b border-border/60 bg-muted/30',
                  'lg:w-[320px] lg:shrink-0 lg:border-b-0 lg:border-e'
                )}
              >
                <ProfileInfoCard profile={profile} loading={loading} />

                {/* Quick Stats */}
                {!loading && profile && (
                  <div className="border-t border-border/50 px-6 py-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('dashboard.profil.infosTitle')}
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <Shield className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{t('dashboard.profil.verified')}</p>
                          <p className="text-xs text-muted-foreground">{t('dashboard.profil.verifiedHint')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                          <Bell className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-medium">{t('dashboard.profil.notifications')}</p>
                          <p className="text-xs text-muted-foreground">{t('dashboard.profil.notificationsHint')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                          <Smartphone className="h-4 w-4 text-green-500" />
                        </div>
                        <div>
                          <p className="font-medium">{t('dashboard.profil.twoFA')}</p>
                          <p className="text-xs text-muted-foreground">{t('dashboard.profil.twoFAHint')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </aside>

              {/* Main Content */}
              <div className="min-w-0 flex-1">
                <Tabs value={tab} onValueChange={setTab} className="w-full">
                  {/* Tabs Header - Mobile optimized */}
                  <div className="border-b border-border/60 bg-muted/20 px-4 py-4 sm:px-6">
                    <TabsList
                      className={cn(
                        'w-full max-w-md bg-background/80 p-1',
                        isMobile && 'grid grid-cols-2'
                      )}
                    >
                      <TabsTrigger
                        value="compte"
                        className="gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
                      >
                        <UserRound className="h-4 w-4" />
                        <span className={isMobile ? 'hidden sm:inline' : ''}>{t('dashboard.profil.tabs.compte')}</span>
                        <span className={isMobile ? 'sm:hidden' : 'hidden'}>{t('dashboard.profil.tabs.profil')}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="securite"
                        className="gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
                      >
                        <Lock className="h-4 w-4" />
                        <span>{t('dashboard.profil.tabs.securite')}</span>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Tab Content */}
                  <div className="p-4 sm:p-6 lg:p-8">
                    <TabsContent value="compte" className="mt-0 outline-none">
                      <FormSection
                        title={t('dashboard.profil.compteSection.title')}
                        description={t('dashboard.profil.compteSection.description')}
                      >
                        <form onSubmit={handleSaveProfile} className="mt-6 space-y-6">
                          {profileMessage && (
                            <SuccessMessage
                              message={profileMessage}
                              onClose={() => setProfileMessage(null)}
                            />
                          )}
                          {profileError && (
                            <Alert variant="destructive">
                              <AlertTitle>{t('common.error')}</AlertTitle>
                              <AlertDescription>{profileError}</AlertDescription>
                            </Alert>
                          )}

                          <FormRow cols={2}>
                            <div className="space-y-2">
                              <Label htmlFor="profil-nom" className="text-sm font-medium">
                                {t('dashboard.profil.labelNomComplet')}
                              </Label>
                              <Input
                                id="profil-nom"
                                value={nom}
                                onChange={(e) => {
                                  setNom(e.target.value);
                                  setProfileMessage(null);
                                }}
                                autoComplete="name"
                                disabled={loading || savingProfile}
                                className="h-11"
                                placeholder={t('dashboard.profil.placeholderNomComplet')}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="profil-telephone" className="text-sm font-medium">
                                {t('dashboard.profil.labelTelephone')}
                              </Label>
                              <Input
                                id="profil-telephone"
                                type="tel"
                                value={telephone}
                                onChange={(e) => {
                                  setTelephone(e.target.value);
                                  setProfileMessage(null);
                                }}
                                autoComplete="tel"
                                disabled={loading || savingProfile}
                                className="h-11"
                                placeholder={t('dashboard.profil.placeholderTelephone')}
                              />
                            </div>
                          </FormRow>

                          <div className="space-y-2">
                            <Label htmlFor="profil-email" className="text-sm font-medium">
                              {t('dashboard.profil.labelEmail')}
                            </Label>
                            <Input
                              id="profil-email"
                              type="email"
                              value={email}
                              onChange={(e) => {
                                setEmail(e.target.value);
                                setProfileMessage(null);
                              }}
                              autoComplete="email"
                              disabled={loading || savingProfile}
                              className="h-11"
                              placeholder={t('dashboard.profil.placeholderEmail')}
                            />
                            <p className="text-xs text-muted-foreground">
                              {t('dashboard.profil.emailHint')}
                            </p>
                          </div>

                          <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                            <Button
                              type="submit"
                              disabled={loading || savingProfile}
                              className="min-w-[160px] bg-[#02389B] hover:bg-[#012a73]"
                            >
                              {savingProfile ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t('dashboard.profil.compteSection.saving')}
                                </>
                              ) : (
                                <>
                                  <Check className="mr-2 h-4 w-4" />
                                  {t('dashboard.profil.compteSection.saveBtn')}
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={loading || savingProfile}
                              onClick={() => {
                                if (profile) {
                                  setNom(profile.nom);
                                  setEmail(profile.email);
                                  setTelephone(profile.telephone || '');
                                  setProfileError(null);
                                  setProfileMessage(null);
                                }
                              }}
                            >
                              {t('actions.cancel')}
                            </Button>
                          </div>
                        </form>
                      </FormSection>
                    </TabsContent>

                    <TabsContent value="securite" className="mt-0 outline-none">
                      <FormSection
                        title={t('dashboard.profil.passwordSection.title')}
                        description={t('dashboard.profil.passwordSection.description')}
                      >
                        <form onSubmit={handleChangePassword} className="mt-6 space-y-6">
                          {passwordMessage && (
                            <SuccessMessage
                              message={passwordMessage}
                              onClose={() => setPasswordMessage(null)}
                            />
                          )}
                          {passwordError && (
                            <Alert variant="destructive">
                              <AlertTitle>{t('common.error')}</AlertTitle>
                              <AlertDescription>{passwordError}</AlertDescription>
                            </Alert>
                          )}

                          <div className="space-y-5">
                            <PasswordField
                              id="profil-current-pw"
                              label={t('dashboard.profil.labelCurrentPwd')}
                              value={currentPassword}
                              onChange={setCurrentPassword}
                              disabled={savingPassword}
                              autoComplete="current-password"
                              show={showCurrent}
                              onToggleShow={() => setShowCurrent((v) => !v)}
                            />

                            <Separator className="my-6" />

                            <PasswordField
                              id="profil-new-pw"
                              label={t('dashboard.profil.labelNewPwd')}
                              value={newPassword}
                              onChange={setNewPassword}
                              disabled={savingPassword}
                              autoComplete="new-password"
                              show={showNew}
                              onToggleShow={() => setShowNew((v) => !v)}
                              hint={t('dashboard.profil.newPwdHint')}
                            />

                            <PasswordField
                              id="profil-confirm-pw"
                              label={t('dashboard.profil.labelConfirmPwd')}
                              value={confirmPassword}
                              onChange={setConfirmPassword}
                              disabled={savingPassword}
                              autoComplete="new-password"
                              show={showConfirm}
                              onToggleShow={() => setShowConfirm((v) => !v)}
                            />
                          </div>

                          <div className="pt-4">
                            <Button
                              type="submit"
                              variant="outline"
                              disabled={savingPassword}
                              className="min-w-[200px]"
                            >
                              {savingPassword ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t('dashboard.profil.passwordSection.updating')}
                                </>
                              ) : (
                                <>
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  {t('dashboard.profil.passwordSection.updateBtn')}
                                </>
                              )}
                            </Button>
                          </div>
                        </form>
                      </FormSection>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </div>
          </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
}
