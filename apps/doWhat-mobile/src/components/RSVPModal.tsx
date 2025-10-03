import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

const { width: screenWidth } = Dimensions.get('window');

type RSVPModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  status: 'going' | 'interested' | 'not_going';
  activityTitle: string;
  loading?: boolean;
};

const RSVPModal: React.FC<RSVPModalProps> = ({
  visible,
  onClose,
  onConfirm,
  status,
  activityTitle,
  loading = false,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'going':
        return {
          icon: 'checkmark-circle' as const,
          color: '#10B981',
          title: 'Confirm RSVP',
          message: 'Are you sure you want to attend this activity?',
          confirmText: 'Yes, I\'m Going!',
        };
      case 'interested':
        return {
          icon: 'heart' as const,
          color: '#2C7BF6',
          title: 'Mark as Interested',
          message: 'Save this activity to your interested list?',
          confirmText: 'Yes, I\'m Interested',
        };
      case 'not_going':
        return {
          icon: 'close-circle' as const,
          color: '#EF4444',
          title: 'Cancel RSVP',
          message: 'Are you sure you want to cancel your RSVP?',
          confirmText: 'Yes, Cancel RSVP',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.modal}>
            <View style={[styles.iconContainer, { backgroundColor: `${config.color}15` }]}>
              <Ionicons name={config.icon} size={40} color={config.color} />
            </View>

            <Text style={styles.title}>{config.title}</Text>
            
            <Text style={styles.activityTitle} numberOfLines={2}>
              {activityTitle}
            </Text>
            
            <Text style={styles.message}>{config.message}</Text>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: config.color }]}
                onPress={onConfirm}
                disabled={loading}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <Ionicons name="refresh" size={16} color="white" />
                    <Text style={styles.confirmButtonText}>Processing...</Text>
                  </View>
                ) : (
                  <Text style={styles.confirmButtonText}>{config.confirmText}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: screenWidth - 40,
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C7BF6',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

export default RSVPModal;
