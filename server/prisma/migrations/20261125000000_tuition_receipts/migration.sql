-- Fee receipts sent to parents. Safe to run more than once.
ALTER TABLE "tuition_payments" ADD COLUMN IF NOT EXISTS "receiptSentAt" TIMESTAMP(3);
ALTER TABLE "tuition_payments" ADD COLUMN IF NOT EXISTS "receiptVia" TEXT;
