'use client';
import { useParams } from 'next/navigation';
import CourseBuilder from '@/components/CourseBuilder';

export default function AdminCourseBuilderPage() {
  const { id } = useParams<{ id: string }>();
  return <CourseBuilder courseId={id} panel="admin" />;
}
