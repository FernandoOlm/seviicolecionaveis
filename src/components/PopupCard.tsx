import { renderPopupIcon, resolvePopupButtonHref } from "@/lib/popup-icons";
import { PromoCodeBlock } from "@/components/PromoCodeBlock";
import { DontShowAgainCheckbox } from "@/components/DontShowAgainCheckbox";

export type PopupCardData = {
  id?: string;
  title: string;
  body_html: string;
  image_url: string | null;
  link_url: string | null;
  is_promo_code?: boolean;
  promo_code?: string | null;
  icon_key?: string | null;
  button_enabled?: boolean | null;
  button_label?: string | null;
  button_action?: string | null;
  button_target?: string | null;
  button_bg_color?: string | null;
  button_text_color?: string | null;
  icon_bg_color?: string | null;
  icon_color?: string | null;
  promo_bg_color?: string | null;
  promo_text_color?: string | null;
  popup_key?: string | null;
};

type Props = {
  popup: PopupCardData;
  onClose?: () => void;
  dontShowAgain?: boolean;
  onDontShowAgainChange?: (v: boolean) => void;
  disabled?: boolean;
};

/** Popup content shared by the live site, the carousel and the admin preview. */
export function PopupCard({
  popup,
  onClose,
  dontShowAgain = false,
  onDontShowAgainChange,
  disabled = false,
}: Props) {
  const isExternal = (url: string) =>
    /^https?:\/\//.test(url) &&
    typeof window !== "undefined" &&
    !url.includes(window.location.host);

  const image = popup.image_url ? (
    <img src={popup.image_url} alt={popup.title} className="block h-auto w-full" />
  ) : null;

  const href = popup.button_enabled
    ? resolvePopupButtonHref(popup.button_action, popup.button_target)
    : null;
  const buttonLabel = popup.button_label?.trim() || "Saiba mais";

  const buttonStyle = {
    ...(popup.button_bg_color ? { backgroundColor: popup.button_bg_color } : {}),
    ...(popup.button_text_color ? { color: popup.button_text_color } : {}),
  };
  const buttonClass = `block w-full rounded-md px-4 py-2.5 text-center text-sm font-semibold hover:opacity-90 ${
    popup.button_bg_color ? "" : "bg-foreground"
  } ${popup.button_text_color ? "" : "text-background"}`;

  return (
    <div>
      {renderPopupIcon(popup.icon_key, {
        color: popup.icon_color ?? undefined,
        bgColor: popup.icon_bg_color ?? undefined,
      })}

      {image &&
        (popup.link_url && !disabled ? (
          <a
            href={popup.link_url}
            onClick={() => onClose?.()}
            className="block"
            target={isExternal(popup.link_url) ? "_blank" : undefined}
            rel="noopener noreferrer"
          >
            {image}
          </a>
        ) : (
          image
        ))}

      {popup.title?.trim() && (
        <h2 className="px-5 pt-4 text-center text-lg font-bold text-foreground">
          {popup.title}
        </h2>
      )}

      {popup.body_html?.trim() && (
        <div
          className="prose prose-sm max-w-none px-5 pt-3 text-sm text-foreground [&_a]:underline [&_img]:max-w-full"
          dangerouslySetInnerHTML={{ __html: popup.body_html }}
        />
      )}

      {popup.is_promo_code && popup.promo_code?.trim() && (
        <PromoCodeBlock
          code={popup.promo_code.trim()}
          bgColor={popup.promo_bg_color}
          textColor={popup.promo_text_color}
        />
      )}


      {popup.button_enabled && (
        <div className="px-5 pt-4">
          {href ? (
            <a
              href={href}
              onClick={() => onClose?.()}
              target={isExternal(href) ? "_blank" : undefined}
              rel="noopener noreferrer"
              style={buttonStyle}
              className={buttonClass}
            >
              {buttonLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onClose?.()}
              style={buttonStyle}
              className={buttonClass}
            >
              {buttonLabel}
            </button>
          )}
        </div>
      )}

      {!popup.is_promo_code && popup.popup_key !== "event-mode" && (
        <div className="bg-background px-4 py-3">
          <DontShowAgainCheckbox
            checked={dontShowAgain}
            onCheckedChange={(v) => onDontShowAgainChange?.(v)}
            id={`popup-dsa-${popup.id ?? "preview"}`}
          />
        </div>
      )}
      {popup.is_promo_code && <div className="h-4" />}
    </div>
  );
}
