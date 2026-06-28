/** 极简 className 合并工具（避免引入 clsx / tailwind-merge 依赖）。 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}
