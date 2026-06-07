import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
} from 'next';
import { getServerLang, type SupportedLang } from './i18n';

/**
 * Helper léger pour les pages qui veulent de la SSR + i18n. Lit le cookie
 * `i18next` côté serveur et injecte `__lang` dans les props pour que `_app`
 * pré-règle i18n avant le 1er render → pas de flash, pas de hydration mismatch.
 *
 * Usage minimal (juste i18n) :
 * ```ts
 * export const getServerSideProps = withI18n();
 * ```
 *
 * Usage composé (i18n + autre data fetching) :
 * ```ts
 * export const getServerSideProps = withI18n(async (ctx) => {
 *   const data = await fetchSomething();
 *   return { props: { data } };
 * });
 * ```
 */
export function withI18n<P extends Record<string, unknown> = Record<string, unknown>>(
  inner?: GetServerSideProps<P>
): GetServerSideProps<P & { __lang: SupportedLang }> {
  return async (ctx: GetServerSidePropsContext) => {
    const lang = getServerLang(ctx.req.headers.cookie);

    if (!inner) {
      return {
        props: { __lang: lang } as P & { __lang: SupportedLang },
      };
    }

    const result = (await inner(ctx)) as GetServerSidePropsResult<P>;

    if ('props' in result) {
      const innerProps = await Promise.resolve(result.props);
      return {
        ...result,
        props: { ...(innerProps as P), __lang: lang },
      };
    }

    return result as GetServerSidePropsResult<P & { __lang: SupportedLang }>;
  };
}
