export function Mark() {
  return <svg viewBox="0 0 44 48" fill="none" aria-hidden="true"><path d="M5 42V6h22c9 0 13 4 13 11 0 6-4 10-11 11l13 14H29L15 26V17h10c3 0 5-1 5-3H15v28H5Z" fill="currentColor" /></svg>;
}
export function XIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 1.2h3.7l-8.1 9.3L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.9L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3Z" /></svg>;
}
export function Star({ filled = false }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
}
