-- Sample seed data for local smoke tests
-- Creates 3 demo profiles with traits, memories, and messages for testing

-- Profile 1: Technical Developer
INSERT INTO profiles (external_id, summary, summary_version, summary_updated_at)
VALUES
  ('demo-dev-user', 'An experienced software engineer who prefers concise, technical explanations. Works primarily with Python and TypeScript, currently exploring distributed systems and AI applications.', 1, now())
ON CONFLICT (external_id) DO NOTHING;

-- Profile 2: Business User
INSERT INTO profiles (external_id, summary, summary_version, summary_updated_at)
VALUES
  ('demo-business-user', 'A product manager who values clear, structured communication. Prefers detailed explanations with real-world examples. Working on SaaS product strategy and customer experience.', 1, now())
ON CONFLICT (external_id) DO NOTHING;

-- Profile 3: Student
INSERT INTO profiles (external_id, summary, summary_version, summary_updated_at)
VALUES
  ('demo-student-user', 'A computer science student learning fundamentals. Appreciates patient, beginner-friendly explanations with step-by-step guidance. Currently studying algorithms and web development.', 1, now())
ON CONFLICT (external_id) DO NOTHING;

-- Traits for Profile 1 (Technical Developer)
INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'name', 'identity', 'string', '"Alex Chen"', 0.95, 'manual'
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'preferred_language', 'communication', 'string', '"English"', 0.9, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'communication_style', 'communication', 'string', '"technical"', 0.85, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'detail_preference', 'communication', 'string', '"brief"', 0.75, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'expertise_level', 'context', 'string', '"advanced"', 0.8, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'interests', 'preferences', 'array', '["Python", "TypeScript", "distributed systems", "AI/ML", "system design"]', 0.7, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-dev-user';

-- Traits for Profile 2 (Business User)
INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'name', 'identity', 'string', '"Sarah Martinez"', 0.95, 'manual'
FROM profiles p WHERE p.external_id = 'demo-business-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'communication_style', 'communication', 'string', '"formal"', 0.8, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-business-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'detail_preference', 'communication', 'string', '"detailed"', 0.85, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-business-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'expertise_level', 'context', 'string', '"intermediate"', 0.7, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-business-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'interests', 'preferences', 'array', '["product strategy", "customer experience", "SaaS metrics", "team leadership"]', 0.6, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-business-user';

-- Traits for Profile 3 (Student)
INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'name', 'identity', 'string', '"Jordan Kim"', 0.95, 'manual'
FROM profiles p WHERE p.external_id = 'demo-student-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'communication_style', 'communication', 'string', '"simple"', 0.75, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-student-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'detail_preference', 'communication', 'string', '"detailed"', 0.8, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-student-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'expertise_level', 'context', 'string', '"beginner"', 0.85, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-student-user';

INSERT INTO traits (profile_id, key, category, value_type, value_json, confidence, source)
SELECT p.id, 'current_goals', 'context', 'array', '["learn data structures", "build first web app", "understand algorithms", "pass CS fundamentals course"]', 0.7, 'extracted'
FROM profiles p WHERE p.external_id = 'demo-student-user';

-- Memories for Profile 1 (Technical Developer)
INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Prefers async/await patterns over callbacks when writing JavaScript.', 'preference', 0.6, 1.0
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Working on a microservices migration project at work.', 'context', 0.8, 1.0
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Recently explored event-driven architecture with Kafka.', 'event', 0.7, 1.0
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Uses VS Code as primary editor with Vim keybindings.', 'fact', 0.5, 1.0
FROM profiles p WHERE p.external_id = 'demo-dev-user';

-- Memories for Profile 2 (Business User)
INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Focuses on user retention metrics and churn reduction strategies.', 'context', 0.8, 1.0
FROM profiles p WHERE p.external_id = 'demo-business-user';

INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Prefers data-driven decision making with clear ROI analysis.', 'preference', 0.7, 1.0
FROM profiles p WHERE p.external_id = 'demo-business-user';

INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Recently launched a new pricing tier for the product.', 'event', 0.6, 1.0
FROM profiles p WHERE p.external_id = 'demo-business-user';

-- Memories for Profile 3 (Student)
INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Struggled with understanding Big O notation initially but now getting better.', 'event', 0.7, 1.0
FROM profiles p WHERE p.external_id = 'demo-student-user';

INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Likes examples with visual diagrams to understand concepts better.', 'preference', 0.8, 1.0
FROM profiles p WHERE p.external_id = 'demo-student-user';

INSERT INTO memories (profile_id, content, type, importance, decay_factor)
SELECT p.id, 'Currently taking an online web development course.', 'context', 0.6, 1.0
FROM profiles p WHERE p.external_id = 'demo-student-user';

-- Sample messages for Profile 1 (Technical Developer)
INSERT INTO messages (profile_id, role, content, request_id, processed)
SELECT p.id, 'user', 'Can you help me understand the trade-offs between REST and GraphQL?', 'req-001', true
FROM profiles p WHERE p.external_id = 'demo-dev-user';

INSERT INTO messages (profile_id, role, content, request_id, processed)
SELECT p.id, 'assistant', 'For your microservices migration, GraphQL can reduce over-fetching but adds complexity. REST is simpler for CRUD operations. Given your async/await preference, consider REST with HTTP/2 for performance.', 'req-001', true
FROM profiles p WHERE p.external_id = 'demo-dev-user';

-- Sample messages for Profile 2 (Business User)
INSERT INTO messages (profile_id, role, content, request_id, processed)
SELECT p.id, 'user', 'What metrics should I track for our new pricing tier?', 'req-002', true
FROM profiles p WHERE p.external_id = 'demo-business-user';

INSERT INTO messages (profile_id, role, content, request_id, processed)
SELECT p.id, 'assistant', 'For your new pricing tier, I recommend tracking: 1) Conversion rate from free to paid, 2) Revenue per user (RPU), 3) Churn rate by tier, 4) Feature adoption rates, 5) Customer lifetime value (CLV). These align with your focus on retention and data-driven decisions.', 'req-002', true
FROM profiles p WHERE p.external_id = 'demo-business-user';

-- Sample messages for Profile 3 (Student)
INSERT INTO messages (profile_id, role, content, request_id, processed)
SELECT p.id, 'user', 'I dont understand how recursion works. Can you explain it simply?', 'req-003', true
FROM profiles p WHERE p.external_id = 'demo-student-user';

INSERT INTO messages (profile_id, role, content, request_id, processed)
SELECT p.id, 'assistant', 'Great question! Think of recursion like a set of Russian nesting dolls. Each doll contains a smaller version of itself until you reach the smallest one. In programming, a function calls itself with a simpler version of the problem until it reaches a base case (the smallest doll). Let me show you a visual example with counting down from 5...', 'req-003', true
FROM profiles p WHERE p.external_id = 'demo-student-user';
