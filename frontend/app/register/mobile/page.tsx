import { cookies } from 'next/headers';
import { getMessages } from '../../../lib/messages';
import OnboardingIntlProvider from '../components/OnboardingIntlProvider';
import MobileStep from './MobileStep';

export default function RegisterMobilePage() {
  const locale = cookies().get('kd_lang')?.value ?? 'en';
  const messages = getMessages(locale);

  return (
    <OnboardingIntlProvider locale={locale} messages={messages}>
      <MobileStep />
    </OnboardingIntlProvider>
  );
}
