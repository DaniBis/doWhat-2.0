import { View, Text, StyleSheet } from 'react-native';

export default function MinimalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>doWhat Mobile ✅</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  text: {
    fontSize: 24,
    fontWeight: '600',
  },
});
