import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { render } from '@react-email/components';
import { env } from './env';
import type { ReactElement } from 'react';

const ses = new SESClient({
  region: 'us-west-2',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

type SendEmailParams = {
  subject: string;
  recipient: string;
  body: ReactElement;
};

export const sendEmail = async ({ subject, recipient, body }: SendEmailParams) => {
  await ses.send(
    new SendEmailCommand({
      Source: 'Kosmo <noreply@kos.moe>',
      Destination: {
        ToAddresses: [recipient],
      },
      Message: {
        Subject: {
          Data: subject,
        },
        Body: {
          Html: {
            Data: await render(body),
          },
        },
      },
    }),
  );
};
