/**
 * Column widths shared by the dense tables (Cases, Responses), as Tailwind classes for the `<col>`.
 * Full literals, so Tailwind sees them. The budget: at 960px of content below 2xl, the columns
 * that stay take about 750px and the comment keeps the rest (more than 200px).
 */
export const SEVERITY_COL = "w-[6.25rem]";
export const RATING_COL = "w-[5.5rem]";
export const PLACE_COL = "w-[18%] 2xl:w-[22%]";
/** Hidden below 2xl, so this is the wide-screen width. */
export const TOPICS_COL = "w-[13%]";
export const DUE_COL = "w-[9rem] 2xl:w-[13rem]";
export const OPENED_COL = "w-[6.5rem]";
export const STATUS_COL = "w-[8rem] 2xl:w-[10rem]";
