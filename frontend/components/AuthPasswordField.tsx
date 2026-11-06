"use client";

import { useId, useState, type ReactElement } from "react";
import { Eye, EyeOff } from "lucide-react";

type AuthPasswordFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
};

export const AuthPasswordField = ({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  minLength,
  required = true,
  disabled = false,
}: AuthPasswordFieldProps): ReactElement => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="auth-password-wrap">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={minLength}
          required={required}
          disabled={disabled}
          className="auth-password-input"
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <EyeOff size={16} strokeWidth={1.75} aria-hidden />
          ) : (
            <Eye size={16} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
};
