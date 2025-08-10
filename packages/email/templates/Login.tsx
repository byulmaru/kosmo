import { Body, Button, Container, Head, Html, Preview, Text } from '@react-email/components';
import dayjs from 'dayjs';
import React from 'react';
import type { Dayjs } from 'dayjs';

type Props = {
  origin: string;
  email: string;
  code: string;
  verificationId: string;
  expiresAt: Dayjs;
};

const Email = ({ origin, email, code, verificationId, expiresAt }: Props) => (
  <Html lang="ko">
    <Head />
    <Preview>인증번호 {code}</Preview>
    <Body>
      <Container>
        <Text>코스모에 {email} 이메일로 로그인하려고 해요.</Text>
        <Button
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: 12,
            fontWeight: 600,
            borderRadius: 8,
            textAlign: 'center',
            backgroundColor: 'rgb(79,70,229)',
            color: 'rgb(255,255,255)',
          }}
          href={`${origin}/auth/email?verificationId=${verificationId}&code=${code}`}
        >
          로그인하기
        </Button>
        <Text>로그인하려면 위 버튼을 누르거나 인증번호 {code} 를 입력해주세요.</Text>
        <Text>인증은 {expiresAt.format('M월 D일 HH:mm:ss')} 까지 유효합니다.</Text>
      </Container>
    </Body>
  </Html>
);

Email.PreviewProps = {
  origin: 'http://localhost:8260',
  email: 'kosmo@example.com',
  code: '123456',
  verificationId: 'asdf',
  expiresAt: dayjs().add(10, 'minutes'),
} satisfies Props;

export default Email;
