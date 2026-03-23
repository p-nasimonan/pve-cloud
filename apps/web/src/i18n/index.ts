import { ja } from "./locales/ja.ts";
import { en } from "./locales/en.ts";
import type { Messages } from "./locales/ja.ts";

export type Locale = "ja" | "en";

export const LOCALES: Locale[] = ["ja", "en"];
export const DEFAULT_LOCALE: Locale = "ja";

const messages: Record<Locale, Messages> = { ja, en };

/**
 * Returns a translation lookup function for the given locale.
 *
 * Usage in Astro frontmatter:
 *   const t = useTranslations(locale);
 *   t("setup.title")  // "初期セットアップ" | "Initial Setup"
 */
export function useTranslations(locale: Locale) {
  const m = messages[locale];

  return function t<K extends NestedKeyOf<Messages>>(
    key: K,
    vars?: Record<string, string>,
  ): string {
    const value = getNestedValue(m, key);
    if (vars) {
      return value.replace(
        /\{(\w+)\}/g,
        (_, k: string) => vars[k] ?? `{${k}}`,
      );
    }
    return value;
  };
}

/**
 * Detects locale from Astro's currentLocale or Accept-Language header.
 */
export function detectLocale(
  currentLocale: string | undefined,
): Locale {
  if (currentLocale && isLocale(currentLocale)) return currentLocale;
  return DEFAULT_LOCALE;
}

function isLocale(v: string): v is Locale {
  return LOCALES.includes(v as Locale);
}

// ── Type helpers for nested dot-notation keys ───────────────────────────────

type NestedKeyOf<T extends object, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends object
    ? NestedKeyOf<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];

function getNestedValue(obj: Record<string, unknown>, key: string): string {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return key;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : key;
}
