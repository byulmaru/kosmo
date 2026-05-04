import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: '01KQM0S7HGTVJNZA6TTTK8T5NM',
      redirectUri: makeRedirectUri({
        scheme: 'kosmo',
        path: 'login',
      }),
      scopes: ['openid', 'profile'],
    },
    {
      authorizationEndpoint: 'https://id.byulmaru.co/oauth/authorize',
      tokenEndpoint: 'https://id.byulmaru.co/oauth/token',
    },
  );
  const authorizationCode = response?.type === 'success' ? response.params.code : undefined;
  if (authorizationCode) {
    console.log(authorizationCode);
  }

  return (
    <View className="bg-background flex-1 justify-center px-6">
      <Text className="text-foreground text-4xl font-black tracking-tight">Kosmo 로그인</Text>
      <Text className="text-muted-foreground mt-3 text-base leading-6">
        OIDC 서버로 이동해서 로그인합니다. 로그인 후 앱으로 돌아오면 authorization code를 받습니다.
      </Text>

      <View className="mt-8 gap-3">
        <Pressable
          accessibilityRole="button"
          disabled={!request}
          onPress={() => {
            promptAsync();
          }}
          className="bg-primary disabled:bg-muted min-h-14 items-center justify-center rounded-2xl px-5"
        >
          {!request ? (
            <ActivityIndicator />
          ) : (
            <Text className="text-primary-foreground text-base font-bold">OIDC로 로그인</Text>
          )}
        </Pressable>

        {response?.type === 'error' && (
          <Text className="text-destructive text-sm">로그인 실패: {response.error?.message}</Text>
        )}

        {authorizationCode && (
          <Text className="text-muted-foreground text-sm">
            authorization code를 받았습니다. 다음 단계에서 서버 교환을 연결하면 됩니다.
          </Text>
        )}
      </View>
    </View>
  );
}
