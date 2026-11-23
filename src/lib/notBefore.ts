/**
 * 从原文里抠「明确钟点」，作为软任务的最早开始时间（`not_before`）。
 *
 * 为什么用正则、不用模型：
 * 同一句「晚上八点」，模型今天给锚点、明天不给；而这件事只需要字符串匹配就能确定。
 * 所以分工是——`is_fixed` 归模型判，钟点归正则兜底，两边互不干涉，prompt 里也不提这个字段。
 *
 * 只认钟点，不认时段：
 *   认：晚上八点 / 八点 / 20:00 / 下午三点半 / 八点一刻 / 20点30
 *   不认：下午 / 晚上 / 今天 / 明天（没有具体时刻，填了等于瞎猜）
 *
 * 输出 "HH:mm"——只表示当天的时刻，不带日期。「八点」每天都是八点，
 * 绑上日期反而会在第二天变成过去的锚点，把任务顶到队列最后。
 */

const CN_DIGIT: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/** 「八」→8、「十二」→12、「二十三」→23、「20」→20 */
function cnToNumber(text: string): number | null {
  if (/^\d{1,2}$/.test(text)) return Number(text)
  if (text === '十') return 10

  const tens = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(text)
  if (tens) {
    const high = tens[1] ? CN_DIGIT[tens[1]] : 1
    const low = tens[2] ? CN_DIGIT[tens[2]] : 0
    return high * 10 + low
  }

  if (text.length === 1 && CN_DIGIT[text] !== undefined) return CN_DIGIT[text]
  return null
}

/** 完整时段词——只有这些才允许把"一点"当钟点 */
const PERIOD_WORD = /(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|夜晚|今晚|明晚)/
/** 偏下午/晚上的修饰，用来给 1–11 点加 12 小时 */
const LATE_PERIOD = /[晚傍夜午]/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function extractNotBefore(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null

  // 1) 24 小时制最不会错：20:00 / 20：00（全角冒号也认）
  const clock = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(text)
  if (clock) {
    const hour = Number(clock[1])
    const minute = Number(clock[2])
    if (hour <= 23 && minute <= 59) return `${pad(hour)}:${pad(minute)}`
  }

  // 2) 「X点[半|一刻|三刻|Y分]」
  const dot =
    /([零一二两三四五六七八九十]{1,3}|\d{1,2})\s*点\s*(半|一刻|三刻|([零一二三四五六七八九十]{1,3}|\d{1,2})\s*分?)?/.exec(
      text,
    )
  if (!dot) return null

  const hourRaw = cnToNumber(dot[1])
  if (hourRaw === null || hourRaw <= 0) return null

  const tail = dot[2] ?? ''
  const before = text.slice(Math.max(0, dot.index - 6), dot.index)

  /**
   * 「一点」是最容易被误伤的：快一点、早一点、晚一点、差一点都不是钟点。
   * 要求它带量词（一点整/一点半/一点钟），或者前面有完整时段词（晚上一点）。
   */
  if (dot[1] === '一' && !/[钟整半刻]/.test(tail) && !PERIOD_WORD.test(before)) return null

  // 「下午三点」→15:00；「下午十二点」还是 12:00（12 不加）
  const hour = hourRaw < 12 && LATE_PERIOD.test(before) ? hourRaw + 12 : hourRaw
  if (hour > 23) return null

  let minute = 0
  if (tail === '半') minute = 30
  else if (tail === '一刻') minute = 15
  else if (tail === '三刻') minute = 45
  else if (tail) {
    const value = cnToNumber(dot[3] ?? tail)
    if (value === null || value > 59) return null
    minute = value
  }

  return `${pad(hour)}:${pad(minute)}`
}
