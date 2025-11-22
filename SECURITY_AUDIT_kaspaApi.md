# Security Audit: Kaspa API Layer

**File:** `packages/toolboxes/src/utxo/helpers/kaspaApi.ts`
**Date:** 2025-01-22
**Status:** CRITICAL ISSUES FOUND - REQUIRES FIXES

## Critical Issues

### 1. URL Injection Vulnerability (CRITICAL)
**Location:** Lines 98, 155, 296
**Severity:** CRITICAL
**Description:** User-provided addresses and transaction IDs are directly interpolated into URLs without validation or encoding.

**Vulnerable Code:**
```typescript
const url = `${baseUrl}/addresses/${strippedAddress}/utxos`;
```

**Attack Vector:**
```typescript
// Attacker could pass:
address = "../../admin/sensitive"
// Resulting URL: https://api.kaspa.org/addresses/../../admin/sensitive/utxos
```

**Fix Required:**
1. Validate address format against Kaspa address regex
2. URL-encode the address component
3. Use proper URL construction (URLSearchParams or URL API)

### 2. Lack of Input Validation (MEDIUM)
**Location:** Multiple functions
**Severity:** MEDIUM
**Description:** No validation of inputs before API calls

**Missing Validations:**
- Address format validation (should use existing `validateKaspaAddress()`)
- Transaction ID format validation (should be hex string)
- Signed transaction hex validation (should be valid hex)

**Fix Required:** Add input validation at function entry points

### 3. BigInt Parsing Without Error Handling (MEDIUM)
**Location:** Lines 112, 165
**Severity:** MEDIUM
**Description:** `BigInt()` can throw on invalid input, causing unhandled exceptions

**Vulnerable Code:**
```typescript
amount: BigInt(utxo.utxoEntry.amount),  // Could throw if malformed
```

**Fix Required:** Wrap in try-catch or validate string format first

### 4. Custom API URL Security (MEDIUM)
**Location:** Line 73
**Severity:** MEDIUM
**Description:** Allows arbitrary URLs without validation, potential data exfiltration

**Attack Vector:**
```typescript
// Attacker could pass:
apiUrl = "https://attacker.com/steal-data"
// All API calls would go to attacker's server
```

**Fix Required:**
1. Validate URL format (must be HTTPS)
2. Optionally: whitelist allowed hostnames
3. Document that custom URLs should only be used for testing

## Medium Issues

### 5. Number.parseInt Without Validation (LOW-MEDIUM)
**Location:** Line 114
**Severity:** LOW-MEDIUM
**Description:** Could return NaN if input is invalid

**Fix Required:** Validate parsed number is not NaN

### 6. Console Logging in Production (LOW)
**Location:** Lines 200, 227-230
**Severity:** LOW
**Description:** Uses console.warn which may leak info in production

**Fix Required:** Use proper logging mechanism or conditional logging

## Recommendations

### Immediate Actions Required:
1. **Add address validation** using existing `validateKaspaAddress()` function
2. **URL-encode all URL components** to prevent injection
3. **Validate custom API URLs** (HTTPS only, optional whitelist)
4. **Add try-catch for BigInt conversions**
5. **Validate Number.parseInt results**

### Best Practices:
1. Use TypeScript strict null checks
2. Add JSDoc examples showing valid input formats
3. Consider rate limiting for API calls
4. Add request timeout configuration
5. Implement retry logic with exponential backoff

## Test Coverage

Current test coverage: **34 tests, 100% function coverage**

Tests cover:
- ✅ Happy path scenarios
- ✅ Error handling
- ✅ Edge cases (empty responses, zero values, large numbers)
- ✅ Network error scenarios
- ❌ Security scenarios (injection, validation)
- ❌ Malicious input handling

**Additional Tests Needed:**
1. Test with malicious addresses (path traversal, injection)
2. Test with invalid BigInt strings
3. Test with malicious custom URLs
4. Test with extremely long inputs (DoS)

## Risk Assessment

**Overall Risk:** MEDIUM-HIGH (before fixes)

**Impact if Exploited:**
- URL injection → Information disclosure, unauthorized API access
- BigInt parsing errors → DoS via exception crashes
- Custom URL → Data exfiltration to attacker servers

**Likelihood:** MEDIUM (requires attacker-controlled input)

## Action Plan

1. Implement fixes for CRITICAL issues (priority 1)
2. Add security-focused tests (priority 2)
3. Implement input validation (priority 2)
4. Address logging and error handling (priority 3)
5. Code review by security team (priority 1)

## Status

- [ ] Fixes implemented
- [ ] Security tests added
- [ ] Code review completed
- [ ] Penetration testing completed
- [ ] Ready for production
