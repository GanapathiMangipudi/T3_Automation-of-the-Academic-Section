-- Create database and switch to it
CREATE DATABASE IF NOT EXISTS university;
USE university;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  role ENUM('student','faculty','admin') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS courses (
  course_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  term VARCHAR(20) NOT NULL,
  seats_total INT NOT NULL DEFAULT 30,
  seats_available INT NOT NULL DEFAULT 30,
  schedule VARCHAR(255) DEFAULT NULL,
  prereq_course_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Registrations table
CREATE TABLE IF NOT EXISTS registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  status ENUM('enrolled','waitlisted','dropped','rejected') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE KEY ux_student_course (student_id, course_id)
);





CREATE TABLE IF NOT EXISTS students (
  student_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('student','professor','admin') DEFAULT 'student',
  program VARCHAR(100),
  year INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS professors (
  username VARCHAR(100) PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  department VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  username VARCHAR(100) PRIMARY KEY,
  full_name VARCHAR(200),
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- normalized course_responses (example)
CREATE TABLE course_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    response_status ENUM('selected', 'deselected') NOT NULL DEFAULT 'selected',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_course_responses_student
        FOREIGN KEY (student_id) REFERENCES students(student_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_course_responses_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id)
        ON DELETE CASCADE,

    CONSTRAINT ux_student_course UNIQUE (student_id, course_id)
);


-- professors table
CREATE TABLE IF NOT EXISTS professors (
  professor_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,    -- login id, could be staff number/email
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  department VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- admins table
CREATE TABLE IF NOT EXISTS admins (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- create attendance table
CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,           -- FK -> courses.course_id
  student_id INT NOT NULL,          -- FK -> students.student_id
  date DATE NOT NULL,               -- attendance date (no time)
  status ENUM('present','absent') NOT NULL,
  marked_by INT NULL,               -- professor id who marked
  marked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_course_student_date (course_id, student_id, date),
  INDEX ix_student_date (student_id, date),
  INDEX ix_course_date (course_id, date)
);

CREATE TABLE assignments (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_by VARCHAR(100) NULL,                 -- must be NULLABLE if ON DELETE SET NULL
  deadline DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignments_professor
    FOREIGN KEY (created_by) REFERENCES professors(username)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;


CREATE TABLE assignment_questions (
  question_id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  position TINYINT NOT NULL,              -- 1..5
  question_text TEXT NOT NULL,
  FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE
);

CREATE TABLE assignment_options (
  option_id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  label CHAR(1) NOT NULL,                 -- 'A'..'D'
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES assignment_questions(question_id) ON DELETE CASCADE,
  UNIQUE(question_id, label)
);

-- submissions / responses
CREATE TABLE assignment_submissions (
  submission_id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  status ENUM('in_progress','submitted','auto_finalized') NOT NULL DEFAULT 'in_progress',
  submitted_at DATETIME NULL,
  last_saved_at DATETIME NULL,
  score DECIMAL(6,2) NULL,                -- percentage
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uniq_assignment_student UNIQUE (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE
);

CREATE TABLE assignment_answers (
  answer_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  question_id INT NOT NULL,
  selected_label CHAR(1) NULL,            -- 'A'..'D' or NULL
  correct TINYINT(1) NULL,
  FOREIGN KEY (submission_id) REFERENCES assignment_submissions(submission_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES assignment_questions(question_id) ON DELETE CASCADE,
  UNIQUE(submission_id, question_id)
);





INSERT INTO users (email, role, name) VALUES
  ('alice@example.com','student','Alice'),
  ('bob@example.com','student','Bob')
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  role  = VALUES(role),
  name  = VALUES(name);


INSERT INTO courses (code, title, term, seats_total, seats_available, schedule)
VALUES
  ('cs101', 'Introduction to Programming', '2025S', 2, 2, 'Mon 9-11'),
  ('cs102', 'Data Structures', '2025S', 1, 1, 'Tue 10-12'),
  ('ee101', 'Basic Circuits', '2025S', 2, 2, 'Wed 11-1')
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  seats_total = VALUES(seats_total),
  seats_available = VALUES(seats_available),
  schedule = VALUES(schedule);

-- assignments and supporting tables
