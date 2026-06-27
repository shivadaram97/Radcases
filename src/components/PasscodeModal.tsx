import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ShieldAlert, Lock, X, Mail, ShieldCheck, ArrowLeft, RefreshCw, Key } from 'lucide-react';

interface PasscodeModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  correctPasscode: string;
  isConfigured: boolean;
  currentUser: any;
  onChangePasscode: (newPasscode: string) => void;
  onSuccess: () => void;
  onClose: () => void;
}

type ModalView = 'verify' | 'setup_passcode' | 'forgot' | 'otp_verify' | 'reset_success';

export default function PasscodeModal({
  isOpen,
  title,
  message,
  correctPasscode,
  isConfigured,
  currentUser,
  onChangePasscode,
  onSuccess,
  onClose,
}: PasscodeModalProps) {
  const [view, setView] = useState<ModalView>('verify');
  
  // Verify state
  const [inputVal, setInputVal] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  
  // Setup state
  const [setupPasscode, setSetupPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [showSetupSecret, setShowSetupSecret] = useState(false);
  const [setupError, setSetupError] = useState('');

  // OTP state
  const [otpCode, setOtpCode] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [otpNotification, setOtpNotification] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const setupRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInputVal('');
      setError(false);
      setSetupPasscode('');
      setConfirmPasscode('');
      setSetupError('');
      setOtpInput('');
      setOtpError(false);
      setOtpNotification(null);
      
      // Route view dynamically
      if (!isConfigured) {
        setView('setup_passcode');
        setTimeout(() => {
          setupRef.current?.focus();
        }, 80);
      } else {
        setView('verify');
        setTimeout(() => {
          inputRef.current?.focus();
        }, 80);
      }
    }
  }, [isOpen, isConfigured]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal === correctPasscode) {
      onSuccess();
      onClose();
    } else {
      setError(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(200);
      }
    }
  };

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = setupPasscode.trim();
    const cleanConfirm = confirmPasscode.trim();

    if (cleanPass.length < 4) {
      setSetupError('Passcode must be at least 4 characters long.');
      return;
    }
    if (cleanPass !== cleanConfirm) {
      setSetupError('Passcodes do not match. Please compile/verify fields.');
      return;
    }

    // Success! Save custom passcode
    onChangePasscode(cleanPass);
    onSuccess();
    onClose();
  };

  const handleSendOTP = () => {
    if (!currentUser || !currentUser.email) {
      return;
    }
    // Generate secure 6-digit random code
    const generated = Math.floor(100000 + Math.random() * 900000).toString();
    setOtpCode(generated);
    setOtpError(false);
    setOtpInput('');
    setView('otp_verify');
    
    // Sandbox simulation toast notification
    const simulationMsg = `${generated}`;
    setOtpNotification(simulationMsg);
    
    setTimeout(() => {
      otpInputRef.current?.focus();
    }, 150);
  };

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpInput === otpCode) {
      // Guide directly to the setup passcode view to create their custom core key
      setSetupPasscode('');
      setConfirmPasscode('');
      setSetupError('');
      setView('setup_passcode');
      setTimeout(() => {
        setupRef.current?.focus();
      }, 150);
    } else {
      setOtpError(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(200);
      }
    }
  };

  return (
    <div 
      id="passcode-modal-overlay" 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-fade-in"
    >
      <div
        id="passcode-modal-container"
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 transition-all transform scale-100 p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          id="close-passcode-modal"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-850 dark:hover:text-slate-300 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {view === 'verify' && (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                <Lock className="h-6 w-6" />
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                {title}
              </h3>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
                {message}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1">
                <label htmlFor="passcode-input" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                  Curator Passcode
                </label>
                <div className="relative">
                  <input
                    id="passcode-input"
                    ref={inputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={inputVal}
                    onChange={(e) => {
                      setInputVal(e.target.value);
                      setError(false);
                    }}
                    placeholder="••••••••"
                    className={`w-full rounded-xl border bg-slate-50/50 px-4 py-3 text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 transition dark:bg-slate-950/40 dark:text-white ${
                      error 
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                        : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800'
                    }`}
                  />
                  <button
                    id="toggle-passcode-visibility"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                
                {error && (
                  <span className="text-[11px] font-medium text-red-500 flex items-center gap-1 mt-1 animate-pulse">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    Incorrect passcode. Please try again.
                  </span>
                )}
                
                <div className="flex justify-between items-center pt-2">
                  <button
                    id="forgot-pass-btn"
                    type="button"
                    onClick={() => setView('forgot')}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-450 hover:underline transition"
                  >
                    Forgot passcode?
                  </button>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  id="passcode-cancel-btn"
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  id="passcode-submit-btn"
                  type="submit"
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600 transition shadow-lg shadow-blue-500/10"
                >
                  Verify
                </button>
              </div>
            </form>
          </>
        )}

        {view === 'setup_passcode' && (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                <Key className="h-6 w-6 animate-pulse" />
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Set Curator Passcode
              </h3>
              <p className="mt-1 text-xs text-slate-550 dark:text-slate-400 max-w-sm">
                Define a high-strength private passcode to secure your clinical registries.
              </p>
            </div>

            <form onSubmit={handleSetupSubmit} className="mt-6 space-y-4">
              <div className="space-y-3">
                <div>
                  <label htmlFor="setup-passcode" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                    New Passcode
                  </label>
                  <div className="relative">
                    <input
                      id="setup-passcode"
                      ref={setupRef}
                      type={showSetupSecret ? 'text' : 'password'}
                      value={setupPasscode}
                      onChange={(e) => {
                        setSetupPasscode(e.target.value);
                        setSetupError('');
                      }}
                      placeholder="At least 4 characters"
                      className="w-full rounded-xl border border-slate-200  bg-slate-50/55 px-4 py-2.5 text-sm font-medium tracking-wide placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-passcode" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                    Confirm Passcode
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-passcode"
                      type={showSetupSecret ? 'text' : 'password'}
                      value={confirmPasscode}
                      onChange={(e) => {
                        setConfirmPasscode(e.target.value);
                        setSetupError('');
                      }}
                      placeholder="Repeat passcode"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/55 px-4 py-2.5 text-sm font-medium tracking-wide placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    />
                    <button
                      id="toggle-setup-visibility"
                      type="button"
                      onClick={() => setShowSetupSecret(!showSetupSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded font-semibold text-xs"
                    >
                      {showSetupSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {setupError && (
                  <span className="text-[11px] font-medium text-red-500 flex items-center gap-1 mt-1">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    {setupError}
                  </span>
                )}
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  id="setup-cancel-btn"
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  id="setup-submit-btn"
                  type="submit"
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-lg shadow-blue-500/10"
                >
                  Save & Secure
                </button>
              </div>
            </form>
          </>
        )}

        {view === 'forgot' && (
          <div className="animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <Mail className="h-6 w-6" />
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Passcode Recovery
              </h3>

              {currentUser && currentUser.email ? (
                <>
                  <p className="mt-2 text-xs text-slate-550 dark:text-slate-400 max-w-sm leading-relaxed">
                    You can reset your passcode securely using an OTP code sent directly to your verified Google mail account <span className="font-bold text-slate-800 dark:text-white">{currentUser.email}</span>.
                  </p>
                </>
              ) : (
                <div className="mt-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-950/20 max-w-xs text-center">
                  <p className="text-xs text-slate-550 dark:text-slate-405 leading-normal">
                    To trigger automatic OTP secure restoration keys, please sign in with your Google Mail account first via the settings Control Center.
                  </p>
                  <p className="mt-3 text-[10px] text-amber-500 dark:text-amber-400 font-bold block">
                    🔐 Hint (Development Offline mode): Default bypass set to <code className="bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">curator123</code>
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              {currentUser && currentUser.email ? (
                <button
                  id="send-otp-mail-btn"
                  type="button"
                  onClick={handleSendOTP}
                  className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition shadow-lg shadow-blue-500/10 flex items-center justify-center gap-1.5"
                >
                  <Mail className="h-4 w-4" /> Send OTP Code to Mail
                </button>
              ) : (
                <button
                  id="offline-recovery-bypass-btn"
                  type="button"
                  onClick={() => {
                    onChangePasscode('curator123'); // restore default bypass
                    setView('reset_success');
                  }}
                  className="w-full rounded-xl bg-slate-800 text-white hover:bg-slate-700 py-3 text-xs font-bold transition shadow-md"
                >
                  Retrieve Default Bypass Key
                </button>
              )}

              <button
                id="forgot-back-btn"
                type="button"
                onClick={() => setView('verify')}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Cancel & Back
              </button>
            </div>
          </div>
        )}

        {view === 'otp_verify' && (
          <div className="animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 animate-pulse">
                <RefreshCw className="h-5 w-5 animate-spin duration-3000" />
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Enter 6-Digit OTP
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Check clinical inbox {currentUser?.email} for your secure system key.
              </p>
            </div>

            <form onSubmit={handleVerifyOTP} className="mt-6 space-y-4 font-sans text-slate-900 dark:text-white">
              {otpNotification && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-slate-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-slate-200 text-left text-[11px] leading-relaxed font-mono flex gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">SMTP Server simulator dispatch:</span>
                    <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white select-all bg-slate-100 dark:bg-slate-950/60 p-2 rounded border border-slate-200 dark:border-slate-800">
                      OTP: {otpNotification}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="otp-input" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                  One-Time-Password Code
                </label>
                <input
                  id="otp-input"
                  ref={otpInputRef}
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => {
                    setOtpInput(e.target.value.replace(/\D/g, ''));
                    setOtpError(false);
                  }}
                  placeholder="******"
                  className={`w-full text-center text-lg tracking-[0.5em] font-mono rounded-xl border bg-slate-50/50 px-4 py-3 text-slate-900 font-bold focus:outline-none focus:ring-2 transition dark:bg-slate-950/40 dark:text-white ${
                    otpError 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800'
                  }`}
                />
                
                {otpError && (
                  <span className="text-[11px] font-medium text-red-500 flex items-center gap-1 mt-1 animate-pulse">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Invalid OTP Code.
                  </span>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  id="otp-cancel-btn"
                  type="button"
                  onClick={() => setView('forgot')}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  id="otp-submit-btn"
                  type="submit"
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-700 active:bg-blue-850 transition shadow-lg"
                >
                  Verify Code
                </button>
              </div>
            </form>
          </div>
        )}

        {view === 'reset_success' && (
          <div className="animate-fade-in text-center flex flex-col items-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/55 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              Passcode Reset Successful
            </h3>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              Your passcode has been reset to default: <code className="bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded font-mono text-slate-700 dark:text-slate-300 font-bold select-all">curator123</code>.
            </p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-450">
              Please change this in the Control Center setup tab as soon as you log in!
            </p>

            <button
              id="reset-success-btn"
              type="button"
              onClick={() => {
                onSuccess();
                onClose();
              }}
              className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-805 dark:bg-blue-650 dark:hover:bg-blue-700 transition shadow-lg"
            >
              Enter Curation System
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
