import { graphql } from '$mearie';
import { useQuery } from '@mearie/react';
import { Text } from 'react-native';

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
