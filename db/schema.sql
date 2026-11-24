-- Tashkent Tech Academic Records Portal — PostgreSQL schema (idempotent)

-- ============ RBAC ============
CREATE TABLE IF NOT EXISTS roles (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  code        text PRIMARY KEY,
  category    text NOT NULL,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id         int  NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

-- ============ Academic structure ============
CREATE TABLE IF NOT EXISTS faculties (
  id         serial PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  dean       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id         serial PRIMARY KEY,
  faculty_id int  NOT NULL REFERENCES faculties(id) ON DELETE RESTRICT,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  head       text
);
CREATE INDEX IF NOT EXISTS idx_departments_faculty ON departments(faculty_id);

CREATE TABLE IF NOT EXISTS programs (
  id             serial PRIMARY KEY,
  department_id  int  NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  code           text NOT NULL UNIQUE,
  name           text NOT NULL,
  degree_level   text NOT NULL CHECK (degree_level IN ('Bachelor','Master','PhD')),
  duration_years int  NOT NULL DEFAULT 4
);
CREATE INDEX IF NOT EXISTS idx_programs_department ON programs(department_id);

CREATE TABLE IF NOT EXISTS academic_years (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  is_current boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS semesters (
  id               serial PRIMARY KEY,
  academic_year_id int  NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  number           int  NOT NULL CHECK (number BETWEEN 1 AND 3),
  name             text NOT NULL,
  start_date       date,
  end_date         date,
  is_current       boolean NOT NULL DEFAULT false,
  is_locked        boolean NOT NULL DEFAULT false,
  locked_at        timestamptz,
  UNIQUE (academic_year_id, number)
);

CREATE TABLE IF NOT EXISTS student_groups (
  id             serial PRIMARY KEY,
  program_id     int  REFERENCES programs(id) ON DELETE RESTRICT, -- NULL = shared group (e.g. common first year)
  name           text NOT NULL UNIQUE,
  admission_year int  NOT NULL,
  curator        text
);
CREATE INDEX IF NOT EXISTS idx_groups_program ON student_groups(program_id);
ALTER TABLE student_groups ALTER COLUMN program_id DROP NOT NULL; -- upgrade older databases

-- ============ Users & sessions ============
CREATE TABLE IF NOT EXISTS users (
  id                   serial PRIMARY KEY,
  username             text NOT NULL UNIQUE,
  full_name            text NOT NULL,
  email                text,
  password_hash        text NOT NULL,
  role_id              int  NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  faculty_id           int  REFERENCES faculties(id) ON DELETE SET NULL, -- optional data scope
  is_active            boolean NOT NULL DEFAULT true,
  failed_attempts      int  NOT NULL DEFAULT 0,
  locked_until         timestamptz,
  last_login_at        timestamptz,
  password_changed_at  timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,                 -- sha256 of the cookie token (raw token never stored)
  user_id    int  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip         text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ============ Students ============
CREATE TABLE IF NOT EXISTS students (
  id               serial PRIMARY KEY,
  student_number   text NOT NULL UNIQUE,
  first_name       text NOT NULL,
  last_name        text NOT NULL,
  middle_name      text,
  passport_enc     text,           -- AES-256-GCM ciphertext
  passport_hash    text,           -- HMAC blind index for exact search / duplicate detection
  jshshir_enc      text,
  jshshir_hash     text,
  date_of_birth    date,
  gender           text CHECK (gender IN ('Male','Female')),
  program_id       int  REFERENCES programs(id) ON DELETE RESTRICT,
  group_id         int  REFERENCES student_groups(id) ON DELETE SET NULL,
  current_year     int  CHECK (current_year BETWEEN 1 AND 8),
  current_semester int  CHECK (current_semester BETWEEN 1 AND 16),
  study_mode       text NOT NULL DEFAULT 'Full-time' CHECK (study_mode IN ('Full-time','Part-time')),
  status           text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Graduated','Suspended','Withdrawn')),
  enrollment_date  date,
  phone            text,
  email            text,
  address          text,
  notes            text,
  custom_data      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz       -- soft delete (recoverable)
);
CREATE INDEX IF NOT EXISTS idx_students_name ON students (lower(last_name), lower(first_name));
CREATE INDEX IF NOT EXISTS idx_students_group ON students(group_id);
CREATE INDEX IF NOT EXISTS idx_students_program ON students(program_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_passport ON students(passport_hash) WHERE deleted_at IS NULL AND passport_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_jshshir  ON students(jshshir_hash)  WHERE deleted_at IS NULL AND jshshir_hash IS NOT NULL;

-- ============ Grading configuration ============
CREATE TABLE IF NOT EXISTS grading_schemes (
  id             serial PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  description    text,
  pass_mark      numeric(5,2) NOT NULL DEFAULT 60,
  min_attendance numeric(5,2) NOT NULL DEFAULT 0,
  retake_cap     numeric(5,2),          -- optional max total after retake
  is_default     boolean NOT NULL DEFAULT false,
  scale          jsonb NOT NULL         -- [{letter, min, points, label}]
);

CREATE TABLE IF NOT EXISTS assessment_types (
  id               serial PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  description      text,
  replaces_type_id int REFERENCES assessment_types(id) ON DELETE SET NULL, -- e.g. RETAKE replaces FINAL
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scheme_components (
  id                 serial PRIMARY KEY,
  scheme_id          int NOT NULL REFERENCES grading_schemes(id) ON DELETE CASCADE,
  assessment_type_id int NOT NULL REFERENCES assessment_types(id) ON DELETE RESTRICT,
  weight             numeric(5,2) NOT NULL DEFAULT 0,
  max_score          numeric(6,2) NOT NULL DEFAULT 100,
  min_score          numeric(6,2) NOT NULL DEFAULT 0,
  UNIQUE (scheme_id, assessment_type_id)
);

-- ============ Subjects / courses / enrollments ============
CREATE TABLE IF NOT EXISTS subjects (
  id            serial PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  department_id int REFERENCES departments(id) ON DELETE SET NULL,
  credits       numeric(4,1) NOT NULL DEFAULT 4,
  ects          numeric(4,1) NOT NULL DEFAULT 6,
  description   text
);

-- A course = a subject offered in a semester to a group
CREATE TABLE IF NOT EXISTS courses (
  id                serial PRIMARY KEY,
  subject_id        int NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  semester_id       int NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  group_id          int REFERENCES student_groups(id) ON DELETE SET NULL,
  instructor        text,
  grading_scheme_id int NOT NULL REFERENCES grading_schemes(id) ON DELETE RESTRICT,
  submitted_at      timestamptz,
  submitted_by      int REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, semester_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_courses_semester ON courses(semester_id);
CREATE INDEX IF NOT EXISTS idx_courses_group ON courses(group_id);

CREATE TABLE IF NOT EXISTS user_course_assignments (
  user_id   int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id int NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id                 serial PRIMARY KEY,
  student_id         int NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  course_id          int NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  status             text NOT NULL DEFAULT 'Enrolled' CHECK (status IN ('Enrolled','Withdrawn')),
  final_score        numeric(6,2),
  letter_grade       text,
  grade_point        numeric(3,2),
  result_status      text NOT NULL DEFAULT 'incomplete' CHECK (result_status IN ('incomplete','passed','failed')),
  needs_retake       boolean NOT NULL DEFAULT false,
  attendance_pct     numeric(5,2),
  instructor_comment text,
  computed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON student_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_result ON student_enrollments(result_status);

-- Current value of each assessment mark (history lives in grade_history)
CREATE TABLE IF NOT EXISTS grades (
  id                 serial PRIMARY KEY,
  enrollment_id      int NOT NULL REFERENCES student_enrollments(id) ON DELETE RESTRICT,
  assessment_type_id int NOT NULL REFERENCES assessment_types(id) ON DELETE RESTRICT,
  score              numeric(6,2),          -- NULL = deleted / not set; rows are never physically removed
  entered_by         int REFERENCES users(id),
  entered_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         int REFERENCES users(id),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, assessment_type_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id            serial PRIMARY KEY,
  enrollment_id int  NOT NULL REFERENCES student_enrollments(id) ON DELETE CASCADE,
  session_date  date NOT NULL,
  status        text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  recorded_by   int REFERENCES users(id),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, session_date)
);

-- ============ Approvals & history ============
CREATE TABLE IF NOT EXISTS grade_change_requests (
  id                 serial PRIMARY KEY,
  enrollment_id      int NOT NULL REFERENCES student_enrollments(id) ON DELETE RESTRICT,
  assessment_type_id int NOT NULL REFERENCES assessment_types(id),
  old_score          numeric(6,2),
  new_score          numeric(6,2),
  reason             text NOT NULL,
  requested_by       int NOT NULL REFERENCES users(id),
  requested_at       timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by        int REFERENCES users(id),
  reviewed_at        timestamptz,
  review_comment     text
);
CREATE INDEX IF NOT EXISTS idx_gcr_status ON grade_change_requests(status);

CREATE TABLE IF NOT EXISTS grade_history (
  id                  bigserial PRIMARY KEY,
  enrollment_id       int NOT NULL,
  student_id          int NOT NULL,
  course_id           int NOT NULL,
  assessment_type_id  int NOT NULL,
  old_score           numeric(6,2),
  new_score           numeric(6,2),
  action              text NOT NULL CHECK (action IN ('Created','Updated','Deleted')),
  reason              text,
  changed_by          int REFERENCES users(id),
  changed_at          timestamptz NOT NULL DEFAULT now(),
  approval_request_id int REFERENCES grade_change_requests(id),
  approval_status     text,
  approved_by         int REFERENCES users(id),
  ip                  text
);
CREATE INDEX IF NOT EXISTS idx_gh_student ON grade_history(student_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gh_course ON grade_history(course_id);
CREATE INDEX IF NOT EXISTS idx_gh_changed_at ON grade_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gh_user ON grade_history(changed_by);

-- ============ Operations ============
CREATE TABLE IF NOT EXISTS import_export_history (
  id          serial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('import','export')),
  entity      text NOT NULL,
  file_name   text,
  status      text NOT NULL DEFAULT 'completed' CHECK (status IN ('preview','completed','cancelled','failed')),
  rows_total  int NOT NULL DEFAULT 0,
  rows_ok     int NOT NULL DEFAULT 0,
  rows_failed int NOT NULL DEFAULT 0,
  errors      jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload     jsonb,              -- parsed rows held between preview and confirmation
  user_id     int REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial PRIMARY KEY,
  user_id    int REFERENCES users(id),
  action     text NOT NULL,
  entity     text,
  entity_id  text,
  details    jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);

CREATE TABLE IF NOT EXISTS system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by int REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id          serial PRIMARY KEY,
  entity      text NOT NULL DEFAULT 'student',
  field_key   text NOT NULL,
  label       text NOT NULL,
  field_type  text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','select','checkbox')),
  options     text,
  is_required boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  UNIQUE (entity, field_key)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         bigserial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS custom_modules (
  id                  serial PRIMARY KEY,
  slug                text NOT NULL UNIQUE,
  title               text NOT NULL,
  icon                text NOT NULL DEFAULT 'FileText',
  content             text,
  link_url            text,
  required_permission text,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS backups (
  id         serial PRIMARY KEY,
  file_name  text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('auto','manual','pre-restore')),
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Views ============
CREATE OR REPLACE VIEW v_students AS
SELECT s.*,
       p.code AS program_code, p.name AS program_name, p.degree_level,
       d.id AS department_id, d.name AS department_name,
       f.id AS faculty_id, f.code AS faculty_code, f.name AS faculty_name,
       g.name AS group_name
FROM students s
LEFT JOIN programs p       ON p.id = s.program_id
LEFT JOIN departments d    ON d.id = p.department_id
LEFT JOIN faculties f      ON f.id = d.faculty_id
LEFT JOIN student_groups g ON g.id = s.group_id;

CREATE OR REPLACE VIEW v_courses AS
SELECT c.*,
       sub.code AS subject_code, sub.name AS subject_name, sub.credits, sub.ects,
       sem.name AS semester_name, sem.number AS semester_number, sem.is_locked, sem.is_current,
       ay.id AS academic_year_id, ay.name AS academic_year_name,
       g.name AS group_name, p.id AS program_id, d.faculty_id,
       gs.name AS scheme_name
FROM courses c
JOIN subjects sub        ON sub.id = c.subject_id
JOIN semesters sem       ON sem.id = c.semester_id
JOIN academic_years ay   ON ay.id = sem.academic_year_id
LEFT JOIN student_groups g ON g.id = c.group_id
LEFT JOIN programs p     ON p.id = g.program_id
LEFT JOIN departments d  ON d.id = p.department_id
JOIN grading_schemes gs  ON gs.id = c.grading_scheme_id;

-- ============ Integrity triggers ============
-- Append-only protection: history and audit rows can never be updated or deleted.
CREATE OR REPLACE FUNCTION prevent_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grade_history_immutable ON grade_history;
CREATE TRIGGER trg_grade_history_immutable BEFORE UPDATE OR DELETE ON grade_history
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Every change to a grade is written to grade_history by the database itself,
-- so no code path (API, import, manual SQL) can change a mark without a trace.
-- The application supplies context via transaction-local settings (app.user_id, app.reason, ...).
CREATE OR REPLACE FUNCTION log_grade_change() RETURNS trigger AS $$
DECLARE
  v_enr int; v_type int; v_old numeric; v_new numeric; v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.score IS NULL THEN RETURN NEW; END IF;
    v_enr := NEW.enrollment_id; v_type := NEW.assessment_type_id; v_old := NULL; v_new := NEW.score; v_action := 'Created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.score IS NOT DISTINCT FROM OLD.score THEN RETURN NEW; END IF;
    v_enr := NEW.enrollment_id; v_type := NEW.assessment_type_id; v_old := OLD.score; v_new := NEW.score;
    v_action := CASE WHEN NEW.score IS NULL THEN 'Deleted' WHEN OLD.score IS NULL THEN 'Created' ELSE 'Updated' END;
  ELSE
    v_enr := OLD.enrollment_id; v_type := OLD.assessment_type_id; v_old := OLD.score; v_new := NULL; v_action := 'Deleted';
  END IF;

  INSERT INTO grade_history (enrollment_id, student_id, course_id, assessment_type_id, old_score, new_score, action,
                             reason, changed_by, changed_at, approval_request_id, approval_status, approved_by, ip)
  SELECT v_enr, e.student_id, e.course_id, v_type, v_old, v_new, v_action,
         NULLIF(current_setting('app.reason', true), ''),
         NULLIF(current_setting('app.user_id', true), '')::int,
         COALESCE(NULLIF(current_setting('app.changed_at', true), '')::timestamptz, now()),
         NULLIF(current_setting('app.approval_id', true), '')::int,
         NULLIF(current_setting('app.approval_status', true), ''),
         NULLIF(current_setting('app.approved_by', true), '')::int,
         NULLIF(current_setting('app.ip', true), '')
  FROM student_enrollments e WHERE e.id = v_enr;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grades_history ON grades;
CREATE TRIGGER trg_grades_history AFTER INSERT OR UPDATE OR DELETE ON grades
  FOR EACH ROW EXECUTE FUNCTION log_grade_change();

-- Physical deletion of grades is blocked; "deleting" a mark sets score = NULL (logged as Deleted).
DROP TRIGGER IF EXISTS trg_grades_no_delete ON grades;
CREATE TRIGGER trg_grades_no_delete BEFORE DELETE ON grades
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();
