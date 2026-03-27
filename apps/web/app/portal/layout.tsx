export const metadata = {
  title: 'Portal de Soporte | NovaDesk',
  description: 'Portal de autoservicio con asistente de IA para soporte tecnico.',
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col bg-white dark:bg-gray-950">
      {children}
    </div>
  );
}
