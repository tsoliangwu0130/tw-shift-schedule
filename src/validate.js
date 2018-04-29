const lexer = require('./lexer')

const transformed = {
  two_week: 'two_week_transformed',
  four_week: 'four_week_transformed',
  eight_week: 'eight_week_transformed'
}

function validate (schedule, opts) {
  if (!opts || !opts.transformed) {
    return validateNormal(schedule)
  }

  // FIXME: 如果班表的開頭不是變形工時週期的開頭，會無法正確判斷
  switch (opts.transformed) {
    case transformed.two_week:
      return validateTwoWeekTransformed(schedule)
    case transformed.four_week:
      return validateFourWeekTransformed(schedule)
    case transformed.eight_week:
      return validateEightWeekTransformed(schedule)
  }

  throw (new Error('Invalid transform: ', opts.transformed))
}

function validateNormal (schedule) {
  let ret = []
  let tokens = lexer(schedule.body)
  let invalidOffset = findInvalidToken(tokens)
  if (invalidOffset !== -1) {
    ret.push({ type: 'error', msg: 'invalid token', offset: invalidOffset })
  }

  // 一週內要有一個例假
  let e2 = assertMaxWorkDayCountInPeriod(tokens, 7, 6, '每週至少要有一個例假、一個休息日')
  if (e2) {
    ret.push(e2)
  }

  if (totalTokenLength(tokens) < 24 * 60 * 30) {
    ret.push({ type: 'warning', msg: '班表不完整，無法判斷加班時數是否合法' })
  } else {
    // 單月加班上限不可超過 46 小時
    if ((totalWorkHour(tokens) - 60 * 40 * 4) > 46) {
      ret.push({ type: 'error', msg: '加班時數超過 46 小時' })
    }
  }

  return ret
}

function validateTwoWeekTransformed (schedule) {
  let ret = []
  let tokens = lexer(schedule.body)
  let invalidOffset = findInvalidToken(tokens)
  if (invalidOffset !== -1) {
    ret.push({ type: 'error', msg: 'invalid token', offset: invalidOffset })
  }

  // 如果給的班表長度小於兩週，無法真正判斷是否符合雙週變形工時
  if (totalTokenLength(tokens) < 60 * 24 * 14) {
    ret.push({ type: 'warning', msg: 'insufficient schedule length' })
  }

  // 不可連續工作超過六日
  let e = assertContinuousWorkDay(tokens, 6, '連續工作超過六日')
  if (e) {
    ret.push(e)
  }

  // 兩週內要有兩個例假
  let e2 = assertMaxWorkDayCountInPeriod(tokens, 14, 12, '兩週內應有兩個例假與兩個休息日')
  if (e2) {
    ret.push(e2)
  }

  return ret
}

function validateFourWeekTransformed (schedule) {
  let ret = []
  let tokens = lexer(schedule.body)
  let invalidOffset = findInvalidToken(tokens)
  if (invalidOffset !== -1) {
    ret.push({ type: 'error', msg: 'invalid token', offset: invalidOffset })
  }

  // 如果給的班表長度小於四週，無法真正判斷是否符合雙週變形工時
  if (totalTokenLength(tokens) < 60 * 24 * 4 * 7) {
    ret.push({ type: 'warning', msg: 'insufficient schedule length' })
  }

  // 四週內要有四個例假
  let e2 = assertMaxWorkDayCountInPeriod(tokens, 7 * 4, 7 * 4 - 4, '四週內應有四個例假 + 四個休假日')
  if (e2) {
    ret.push(e2)
  }

  // 兩週內要有兩個例假
  let e3 = assertMaxWorkDayCountInPeriod(tokens, 7 * 2, 7 * 2 - 2, '每兩週內應有兩個例假')
  if (e3) {
    ret.push(e3)
  }

  return ret
}

function validateEightWeekTransformed (schedule) {
  let ret = []
  let tokens = lexer(schedule.body)
  let invalidOffset = findInvalidToken(tokens)
  if (invalidOffset !== -1) {
    ret.push({ type: 'error', msg: 'invalid token', offset: invalidOffset })
  }

  // 如果給的班表長度小於八週，無法真正判斷是否符合雙週變形工時
  if (totalTokenLength(tokens) < 60 * 24 * 8 * 7) {
    ret.push({ type: 'warning', msg: 'insufficient schedule length' })
  }

  // 不可連續工作超過六日
  let e = assertContinuousWorkDay(tokens, 6, '連續工作超過六日')
  if (e) {
    ret.push(e)
  }

  // 八週內要有八個例假
  let e2 = assertMaxWorkDayCountInPeriod(tokens, 7 * 8, 7 * 8 - 8, '八週內應有八個例假 + 八個休息日')
  if (e2) {
    ret.push(e2)
  }

  return ret
}

function findInvalidToken (tokens) {
  let offset = 0
  for (let t of tokens) {
    if (t.type === 'invalid') {
      return offset
    }

    offset += t.value.length
  }

  return -1
}

function totalTokenLength (tokens) {
  return tokens.map(t => t.value.length).reduce((x, sum) => x + sum, 0)
}

function totalWorkHour (tokens) {
  return tokens.filter(t => t.type === 'work').map(t => t.value.length).reduce((x, sum) => x + sum, 0)
}

function findTokenTypeAt (tokens, pos) {
  let offset = 0
  for (let t of tokens) {
    if ((pos - offset) < t.value.length) {
      return t.type
    }

    offset += t.value.length
  }

  return undefined
}

function assertContinuousWorkDay (tokens, max, msg) {
  let continueWorked = 0
  for (let i = 0; ; i += 24 * 60) {
    let tokenType = findTokenTypeAt(tokens, i)
    if (!tokenType) break

    if (tokenType === 'fullRest') {
      continueWorked = 0
    } else {
      continueWorked += 1
      if (continueWorked > max) {
        return { type: 'error', msg: msg, offset: i }
      }
    }
  }

  return undefined
}

function assertMaxWorkDayCountInPeriod (tokens, period, maxWorkDayCount, msg) {
  let workday = 0
  for (let i = 0; ; i += 24 * 60) {
    let tokenType = findTokenTypeAt(tokens, i)
    if (!tokenType) {
      if (workday > maxWorkDayCount) {
        return { type: 'error', msg: msg, offset: i }
      }
      break
    }

    if (tokenType !== 'fullRest') {
      workday += 1
    }

    if (i !== 0 && (i % (24 * 60 * (period - 1)) === 0)) {
      if (workday > maxWorkDayCount) {
        return { type: 'error', msg: msg, offset: i }
      }
      workday = 0
    }
  }
}

module.exports = validate
module.exports.transformed = transformed