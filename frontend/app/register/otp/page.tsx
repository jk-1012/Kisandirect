import { cookies } from 'next/headers';
import { getMessages } from '../../../lib/messages';
import OnboardingIntlProvider from '../components/OnboardingIntlProvider';
import OtpStep from './OtpStep';

export default function RegisterOtpPage() {
  const locale = cookies().get('kd_lang')?.value ?? 'en';
  const messages = getMessages(locale);

  return (
    <OnboardingIntlProvider locale={locale} messages={messages}>
      <OtpStep />
    </OnboardingIntlProvider>
  );
}
