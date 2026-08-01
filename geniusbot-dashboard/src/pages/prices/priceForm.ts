import type { PriceWrite } from '../../api/pricesApi'

export type PriceForm = Omit<PriceWrite, 'price'> & { price: string }

export function validatePriceForm(form: PriceForm, insurance: boolean) {
  const errors: Record<string, string> = {}
  if (!form.service_id) errors.service_id = 'Service is required.'
  if (!form.payment_method_id) errors.payment_method_id = 'Payment method is required.'
  if (form.price === '' || !Number.isFinite(Number(form.price)) || Number(form.price) < 0) errors.price = 'Price must be zero or greater.'
  if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) errors.currency = 'Use a three-letter currency code.'
  if (!form.valid_from) errors.valid_from = 'Valid from is required.'
  if (form.valid_to && form.valid_to < form.valid_from) errors.valid_to = 'Valid to cannot be before valid from.'
  if (insurance && !form.insurance_company_id) errors.insurance_company_id = 'Insurance company is required.'
  if (insurance && !form.insurance_class_id) errors.insurance_class_id = 'Insurance class is required.'
  return errors
}

export function priceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/overlap|exclusion|23P01/i.test(message)) return 'This price period overlaps an existing active price.'
  if (/clinic|tenant/i.test(message)) return 'A selected resource does not belong to this clinic.'
  if (/inactive/i.test(message)) return 'A selected resource is inactive.'
  if (/insurance.*(class|company)|class.*company/i.test(message)) return 'Select a valid insurance company and class combination.'
  if (/valid_to|date range|dates/i.test(message)) return 'The validity date range is invalid.'
  if (/non-negative|price/i.test(message)) return 'Price must be zero or greater.'
  if (/not found|404/i.test(message)) return 'Price not found. Reload and try again.'
  return 'Unable to save the price. Review the form and try again.'
}
