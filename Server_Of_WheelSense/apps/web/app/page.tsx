import Link from 'next/link';

const HomePage = () => (
  <section className='flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
    <h2 className='text-xl font-semibold text-slate-900'>Overview</h2>
    <p className='text-sm text-slate-600'>
      Use the navigation links below to explore telemetry and routing views.
    </p>
    <div className='flex gap-3'>
      <Link className='rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow' href='/map'>
        Open Routing Map
      </Link>
    </div>
  </section>
);

export default HomePage;

