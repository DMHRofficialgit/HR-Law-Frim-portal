"use client";

import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { TooltipAnchor, type TooltipSide } from "./TooltipAnchor";

type SharedProps = {
  label: string;
  children: ReactNode;
  className?: string;
  danger?: boolean;
  side?: TooltipSide;
  "aria-label"?: string;
};

type IconButtonAsButton = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "title" | "aria-label"> & {
    href?: undefined;
  };

type IconButtonAsLink = SharedProps & {
  href: string;
  onClick?: () => void;
};

export type IconButtonProps = IconButtonAsButton | IconButtonAsLink;

export const IconButton = (props: IconButtonProps): ReactElement => {
  const label = props.label;
  const danger = props.danger ?? false;
  const a11y = props["aria-label"] || label;
  const classes = ["shell-icon-btn", danger ? "shell-icon-btn-danger" : "", props.className || ""]
    .filter(Boolean)
    .join(" ");

  if (props.href) {
    return (
      <TooltipAnchor label={label} side={props.side}>
        <Link
          href={props.href}
          className={classes}
          aria-label={a11y}
          onClick={props.onClick}
        >
          {props.children}
        </Link>
      </TooltipAnchor>
    );
  }

  const {
    label: _label,
    children,
    className: _className,
    danger: _danger,
    side,
    "aria-label": _aria,
    href: _href,
    ...buttonProps
  } = props;

  return (
    <TooltipAnchor label={label} side={side}>
      <button type="button" className={classes} aria-label={a11y} {...buttonProps}>
        {children}
      </button>
    </TooltipAnchor>
  );
};
