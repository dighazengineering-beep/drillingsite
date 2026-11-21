/**
 * A hydrogeological survey is always the first step for anyone who needs a borehole, so it is listed first everywhere.
 * Everything else keeps its existing order.
 */
export const isSurvey = (name: unknown) => /survey/i.test(String(name ?? "")) && !/report/i.test(String(name ?? ""));
export function surveyFirst<T extends { name?: unknown }>(items: T[]): T[] {
  return [...items.filter((x) => isSurvey(x.name)), ...items.filter((x) => !isSurvey(x.name))];
}
