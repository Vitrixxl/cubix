import React from "react";

/** Visual primitives shared by the application and its startup window. */
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <span aria-hidden="true" className="icon" style={{
    width: size, height: size, maskImage: `url(../assets/icons/${name}.svg)`,
  }} />;
}

export function ActionButton({icon, children, className = "", ...props}:
  React.ButtonHTMLAttributes<HTMLButtonElement> & {icon?: string}) {
  return <button type="button" {...props} className={`button ${className}`}>
    {icon && <Icon name={icon} />} {children}
  </button>;
}
