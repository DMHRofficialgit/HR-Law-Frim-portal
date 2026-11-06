"use client";

import type { ReactElement, ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export const AuthShell = ({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps): ReactElement => {
  return (
    <main className="auth-split">
      <aside className="auth-brand" aria-label="DMHR Group">
        <div className="auth-brand-media" aria-hidden>
          <img
            src="/auth/dmhr-auth-hero.jpg"
            alt=""
            className="auth-brand-img"
          />
          <div className="auth-brand-scrim" />
        </div>
        <div className="auth-brand-content">
          <img
            src="/logo/dmhr_transparent_logo.png"
            alt="DMHR Group"
            className="auth-brand-logo"
          />
          <p className="auth-brand-kicker">DMHR Group</p>
          <p className="auth-brand-tagline">
            HR &amp; employment law client portal
          </p>
        </div>
      </aside>

      <section className="auth-form-panel">
        <div className="auth-form-inner auth-form-enter">
          <div className="auth-form-mobile-brand">
            <img
              src="/logo/dmhr_transparent_logo.png"
              alt="DMHR Group"
              className="auth-form-mobile-logo"
            />
          </div>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          {footer ? <div className="auth-form-footer">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
};
