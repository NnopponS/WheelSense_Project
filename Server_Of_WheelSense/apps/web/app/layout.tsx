import '../styles/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WheelSense Dashboard',
  description: 'Realtime telemetry and mesh routing overview'
};

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang='en'>
    <body className='min-h-screen bg-slate-100'>
      <main className='mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-6'>
        <header className='flex flex-col gap-2'>
          <h1 className='text-3xl font-semibold text-slate-900'>WheelSense Dashboard</h1>
          <p className='text-sm text-slate-500'>
            Monitor wheel telemetry, room presence, and mesh routing recovery in realtime.
          </p>
        </header>
        {children}
      </main>
    </body>
  </html>
);

export default RootLayout;
