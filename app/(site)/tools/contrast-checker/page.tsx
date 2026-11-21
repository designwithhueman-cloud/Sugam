import { Resource } from '@/components/landing/Resource.tsx';
import { ContrastChecker } from '@/components/landing/ContrastChecker.tsx';

export const metadata = { title: 'Free contrast checker | Avara', description: 'Check text and background colours against WCAG 2.2 AA and get the closest colour that passes.' };

export default function Page() {
  return (
    <Resource wide kicker="Free tool" title="Colour contrast checker" lede="Enter a text colour and a background colour. You get the WCAG ratio, which sizes pass, and the closest colour that does if yours does not.">
      <ContrastChecker />
    </Resource>
  );
}
