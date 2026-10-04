-- Main mark + extra parts (Reading / Writing / Dictation) for subjects.
ALTER TABLE "subjects"             ADD COLUMN IF NOT EXISTS "components"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "exam_subject_configs" ADD COLUMN IF NOT EXISTS "componentMaxMarks" JSONB;
ALTER TABLE "marks"                ADD COLUMN IF NOT EXISTS "componentMarks"    JSONB;
