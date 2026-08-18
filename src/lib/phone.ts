function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function canonicalMxPhoneKey(value: string): string {
  const digits = digitsOnly(value)
  if (!digits) return ''

  if (digits.length >= 10) {
    return digits.slice(-10)
  }

  return digits
}

export function normalizeMexPhoneToE164(value: string): string {
  const key = canonicalMxPhoneKey(value)
  if (key.length !== 10) return ''
  return `+52${key}`
}

export function phonesMatchMx(left: string, right: string): boolean {
  const leftKey = canonicalMxPhoneKey(left)
  const rightKey = canonicalMxPhoneKey(right)
  return Boolean(leftKey) && Boolean(rightKey) && leftKey === rightKey
}

export function extractPossiblePhoneKey(value: string): string {
  return canonicalMxPhoneKey(value)
}
