'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { useMe } from '@/lib/client/useMe';
import { Empty, SkelRows } from '@/components/ui';
import CourseCards from '@/components/CourseCards';

export default function InstructorCourses() {
  const me = useMe();
  const [courses, setCourses] = useState<any[] | null>(null);
  useEffect(() => { api('/api/courses').then((d) => setCourses(d.courses)).catch(() => setCourses([])); }, []);
  return (<>
    <div className="page-head">
      <div>
        <h1>📚 My Courses</h1>
        <div className="sub">Courses you teach (through your batches). Open one to see or edit its lessons.</div>
      </div>
    </div>
    {me && !me.permissions.manage_content && (
      <div className="hint warn">
        You can view these courses. To add videos, notes, quizzes or assignments, ask an admin to grant you
        <b> “Manage course content”</b>.
      </div>
    )}
    <div className="card">
      {courses === null ? <SkelRows /> : courses.length === 0
        ? <Empty icon="📚" text="No courses yet — an admin needs to assign you to a batch first." />
        : <CourseCards courses={courses} base="/instructor/courses" />}
    </div>
  </>);
}
