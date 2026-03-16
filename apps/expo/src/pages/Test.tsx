import { useQuery } from '@mearie/react';
import { Text } from 'react-native';
import { graphql } from '$mearie';

export default function TestPage() {
  const { data } = useQuery(
    graphql(`
      query TestQuery {
        languages
      }
    `),
  );

  return <Text>{data?.languages}</Text>;
}
