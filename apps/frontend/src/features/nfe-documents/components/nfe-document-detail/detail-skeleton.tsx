export function DetailSkeleton() {
  return (
    <div className='flex animate-pulse flex-col gap-6'>
      <div className='bg-muted h-40 rounded-xl' />
      <div className='bg-muted h-24 rounded-xl' />
      <div className='bg-muted h-10 w-full max-w-lg rounded' />
      <div className='bg-muted h-96 rounded-xl' />
    </div>
  );
}
