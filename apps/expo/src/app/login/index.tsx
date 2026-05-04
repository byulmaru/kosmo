// import { fetch } from 'expo/fetch';
import { sessionName } from '@kosmo/core';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { setItemAsync } from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const authorizationEndpoint = 'https://id.byulmaru.co/oauth/authorize';
const clientId = '01KQM0S7HGTVJNZA6TTTK8T5NM';
const redirectUri = makeRedirectUri({
  scheme: 'kosmo',
  path: 'login',
});
const scopes = ['openid', 'profile'];

export default function Login() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string>();

  const login = async () => {
    setErrorMessage(undefined);
    setSessionState('loading');

    try {
      const state = await createCodeVerifier();
      const authorizeUrl = new URL(authorizationEndpoint);

      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', clientId);
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      authorizeUrl.searchParams.set('scope', scopes.join(' '));
      authorizeUrl.searchParams.set('state', state);

      const result = await WebBrowser.openAuthSessionAsync(authorizeUrl.toString(), redirectUri);

      if (result.type !== 'success') {
        setSessionState('idle');
        return;
      }

      const callbackUrl = new URL(result.url);
      const code = callbackUrl.searchParams.get('code');
      const returnedState = callbackUrl.searchParams.get('state');

      if (!code || returnedState !== state) {
        throw new Error('OIDC 응답을 확인할 수 없습니다.');
      }

      const { session_token: sessionToken } = await fetch('/login/session', {
        body: JSON.stringify({
          code,
          redirect_uri: redirectUri,
          session_type: Platform.OS === 'web' ? 'web' : 'app',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }).then((res) => res.json() as Promise<{ session_token?: string }>);

      if (sessionToken) {
        await setItemAsync(sessionName, sessionToken);
      }

      router.replace('/');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.');
      setSessionState('error');
    }
  };

  return (
    <View className="bg-background flex-1 justify-center px-6">
      <Text className="text-foreground text-4xl font-black tracking-tight">Kosmo 로그인</Text>
      <Text className="text-muted-foreground mt-3 text-base leading-6">
        OIDC 서버로 이동해서 로그인합니다. 로그인 후 앱으로 돌아오면 authorization code를 받습니다.
      </Text>

      <View className="mt-8 gap-3">
        <Pressable
          accessibilityRole="button"
          disabled={sessionState === 'loading'}
          onPress={() => {
            login();
          }}
          className="bg-primary disabled:bg-muted min-h-14 items-center justify-center rounded-2xl px-5"
        >
          {sessionState === 'loading' ? (
            <ActivityIndicator />
          ) : (
            <Text className="text-primary-foreground text-base font-bold">OIDC로 로그인</Text>
          )}
        </Pressable>

        {errorMessage && (
          <Text className="text-destructive text-sm">로그인 실패: {errorMessage}</Text>
        )}
      </View>
    </View>
  );
}

const createCodeVerifier = () =>
  Crypto.getRandomBytesAsync(32).then((bytes) => bytes.toBase64({ alphabet: 'base64url' }));
