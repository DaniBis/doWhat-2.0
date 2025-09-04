import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import RSVPModal from './RSVPModal';

type RSVPButtonsProps = {
  onPressGoing: () => void;
  onPressInterested: () => void;
  onPressDecline: () => void;
  currentStatus?: 'going' | 'interested' | 'declined' | null;
  activityTitle?: string;
  loading?: boolean;
};

const RSVPButtons: React.FC<RSVPButtonsProps> = ({
  onPressGoing,
  onPressInterested,
  onPressDecline,
  currentStatus,
  activityTitle = 'Activity',
  loading = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<'going' | 'interested' | 'not_going' | null>(null);

  const handleButtonPress = (action: 'going' | 'interested' | 'declined') => {
    if (action === 'declined') {
      setPendingAction('not_going');
    } else {
      setPendingAction(action);
    }
    setModalVisible(true);
  };

  const handleConfirm = () => {
    if (pendingAction === 'going') {
      onPressGoing();
    } else if (pendingAction === 'interested') {
      onPressInterested();
    } else if (pendingAction === 'not_going') {
      onPressDecline();
    }
    setModalVisible(false);
    setPendingAction(null);
  };

  const handleCancel = () => {
    setModalVisible(false);
    setPendingAction(null);
  };

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity
          style={[
            styles.button,
            styles.goingButton,
            currentStatus === 'going' && styles.activeButton,
          ]}
          onPress={() => handleButtonPress('going')}
          disabled={loading}
        >
          <Text
            style={[
              styles.buttonText,
              styles.goingText,
              currentStatus === 'going' && styles.activeButtonText,
            ]}
          >
            Going
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.interestedButton,
            currentStatus === 'interested' && styles.activeButton,
          ]}
          onPress={() => handleButtonPress('interested')}
          disabled={loading}
        >
          <Text
            style={[
              styles.buttonText,
              styles.interestedText,
              currentStatus === 'interested' && styles.activeButtonText,
            ]}
          >
            Interested
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.declineButton,
            currentStatus === 'declined' && styles.activeButton,
          ]}
          onPress={() => handleButtonPress('declined')}
          disabled={loading}
        >
          <Text
            style={[
              styles.buttonText,
              styles.declineText,
              currentStatus === 'declined' && styles.activeButtonText,
            ]}
          >
            Decline
          </Text>
        </TouchableOpacity>
      </View>

      {pendingAction && (
        <RSVPModal
          visible={modalVisible}
          onClose={handleCancel}
          onConfirm={handleConfirm}
          status={pendingAction}
          activityTitle={activityTitle}
          loading={loading}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
  },
  buttonText: {
    fontWeight: '600',
  },
  goingButton: {
    borderColor: '#16A34A',
    backgroundColor: 'transparent',
  },
  goingText: {
    color: '#16A34A',
  },
  interestedButton: {
    borderColor: '#2C7BF6',
    backgroundColor: 'transparent',
  },
  interestedText: {
    color: '#2C7BF6',
  },
  declineButton: {
    borderColor: '#EF4444',
    backgroundColor: 'transparent',
  },
  declineText: {
    color: '#EF4444',
  },
  activeButton: {
    backgroundColor: '#F3F4F6',
  },
  activeButtonText: {
    fontWeight: '700',
  },
});

export default RSVPButtons;
