import { forwardRef, useState } from "react";
import { useTranslation } from "react-i18next";

type DateInputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * A `<input type="date">` that gives inline validity feedback as the user types
 * instead of only failing silently at submit. Native segmented date inputs let
 * a user produce malformed values (e.g. a 5-digit year) or pick a date outside
 * the allowed range; this surfaces that immediately using the browser's own
 * constraint-validation state, and clears once the value is valid.
 *
 * All props (value, onChange, min, max, className, …) are forwarded, so it is a
 * drop-in replacement for a raw date input.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { onInput, onBlur, ...props },
  ref,
) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  function validate(el: HTMLInputElement) {
    const v = el.validity;
    if (v.badInput) {
      setError(t("components.dateInput.invalid"));
    } else if (v.rangeOverflow) {
      setError(
        props.max
          ? t("components.dateInput.maxWithDate", { max: props.max })
          : t("components.dateInput.tooFarFuture"),
      );
    } else if (v.rangeUnderflow) {
      setError(
        props.min
          ? t("components.dateInput.minWithDate", { min: props.min })
          : t("components.dateInput.tooFarPast"),
      );
    } else {
      setError(null);
    }
  }

  return (
    <>
      <input
        {...props}
        ref={ref}
        type="date"
        onInput={(e) => {
          validate(e.currentTarget);
          onInput?.(e);
        }}
        onBlur={(e) => {
          validate(e.currentTarget);
          onBlur?.(e);
        }}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </>
  );
});
