import markUrl from "../assets/jjcat-mark.png";

export function Brand() {
  return (
    <div className="brand-lockup" data-tauri-drag-region>
      <img src={markUrl} alt="" aria-hidden="true" />
      <span>jjcat</span>
    </div>
  );
}
