-- Part 4.1 step 1: add enum values only (must commit before use as DEFAULT)
ALTER TYPE "SignatureStatus" ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE "SignatureStatus" ADD VALUE IF NOT EXISTS 'ready_for_send';
ALTER TYPE "SignatureStatus" ADD VALUE IF NOT EXISTS 'revision_requested';
