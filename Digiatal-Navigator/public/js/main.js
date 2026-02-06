// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const mainNav = document.querySelector('.main-nav');

  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', function() {
      mainNav.classList.toggle('active');
    });
  }

  // FAQ expandable functionality
  const faqQuestions = document.querySelectorAll('.faq-question');

  faqQuestions.forEach(question => {
    question.addEventListener('click', function() {
      const faqItem = this.parentElement;
      const isActive = faqItem.classList.contains('active');

      // Close all FAQ items
      document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
      });

      // Open clicked item if it wasn't active
      if (!isActive) {
        faqItem.classList.add('active');
      }
    });
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href !== '#' && href.length > 1) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    });
  });

  // Carousel functionality
  const carouselTrack = document.getElementById('carouselTrack');
  const carouselIndicators = document.getElementById('carouselIndicators');
  const prevBtn = document.querySelector('.carousel-btn-prev');
  const nextBtn = document.querySelector('.carousel-btn-next');
  
  if (carouselTrack && carouselIndicators) {
    const slides = carouselTrack.querySelectorAll('.carousel-slide');
    let currentIndex = 0;
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let offset = 0;

    // Create indicators
    slides.forEach((_, index) => {
      const indicator = document.createElement('button');
      indicator.classList.add('carousel-indicator');
      if (index === 0) indicator.classList.add('active');
      indicator.setAttribute('aria-label', `Перейти к слайду ${index + 1}`);
      indicator.addEventListener('click', () => goToSlide(index));
      carouselIndicators.appendChild(indicator);
    });

    function updateCarousel() {
      const slideWidth = slides[0].offsetWidth;
      const gap = 32; // 2rem gap
      offset = -(currentIndex * (slideWidth + gap));
      carouselTrack.style.transform = `translateX(${offset}px)`;
      
      // Update indicators
      carouselIndicators.querySelectorAll('.carousel-indicator').forEach((ind, index) => {
        ind.classList.toggle('active', index === currentIndex);
      });
    }

    function goToSlide(index) {
      currentIndex = index;
      updateCarousel();
    }

    function nextSlide() {
      currentIndex = (currentIndex + 1) % slides.length;
      updateCarousel();
    }

    function prevSlide() {
      currentIndex = (currentIndex - 1 + slides.length) % slides.length;
      updateCarousel();
    }

    // Button events
    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);

    // Touch events for swipe
    carouselTrack.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      carouselTrack.style.transition = 'none';
    });

    carouselTrack.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      const slideWidth = slides[0].offsetWidth;
      const gap = 32;
      const currentOffset = -(currentIndex * (slideWidth + gap));
      carouselTrack.style.transform = `translateX(${currentOffset + diff}px)`;
    });

    carouselTrack.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      carouselTrack.style.transition = 'transform 0.3s ease';
      
      const diff = currentX - startX;
      const threshold = 50; // Minimum swipe distance
      
      if (Math.abs(diff) > threshold) {
        if (diff > 0) {
          prevSlide();
        } else {
          nextSlide();
        }
      } else {
        updateCarousel();
      }
    });

    // Mouse drag events for desktop
    let mouseStartX = 0;
    let mouseCurrentX = 0;
    let isMouseDragging = false;

    carouselTrack.addEventListener('mousedown', (e) => {
      mouseStartX = e.clientX;
      isMouseDragging = true;
      carouselTrack.style.transition = 'none';
      carouselTrack.style.cursor = 'grabbing';
    });

    carouselTrack.addEventListener('mousemove', (e) => {
      if (!isMouseDragging) return;
      e.preventDefault();
      mouseCurrentX = e.clientX;
      const diff = mouseCurrentX - mouseStartX;
      const slideWidth = slides[0].offsetWidth;
      const gap = 32;
      const currentOffset = -(currentIndex * (slideWidth + gap));
      carouselTrack.style.transform = `translateX(${currentOffset + diff}px)`;
    });

    carouselTrack.addEventListener('mouseup', () => {
      if (!isMouseDragging) return;
      isMouseDragging = false;
      carouselTrack.style.transition = 'transform 0.3s ease';
      carouselTrack.style.cursor = 'grab';
      
      const diff = mouseCurrentX - mouseStartX;
      const threshold = 50;
      
      if (Math.abs(diff) > threshold) {
        if (diff > 0) {
          prevSlide();
        } else {
          nextSlide();
        }
      } else {
        updateCarousel();
      }
    });

    carouselTrack.addEventListener('mouseleave', () => {
      if (isMouseDragging) {
        isMouseDragging = false;
        carouselTrack.style.transition = 'transform 0.3s ease';
        carouselTrack.style.cursor = 'grab';
        updateCarousel();
      }
    });

    // Auto-resize on window resize
    window.addEventListener('resize', () => {
      updateCarousel();
    });

    // Initialize
    updateCarousel();
  }

  // Event registration functionality
  const registerButtons = document.querySelectorAll('.event-register-btn');
  const unregisterButtons = document.querySelectorAll('.event-unregister-btn');

  registerButtons.forEach(button => {
    button.addEventListener('click', async function() {
      const eventId = this.getAttribute('data-event-id');
      const button = this;
      
      // Disable button during request
      button.disabled = true;
      button.textContent = 'Регистрация...';

      try {
        const response = await fetch(`/events/${eventId}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (response.ok && data.success) {
          // Update UI
          const eventItem = button.closest('.event-item');
          const actionsDiv = button.closest('.event-registration-actions');
          
          // Update registration count
          const countSpan = eventItem.querySelector('.registration-count');
          if (countSpan) {
            const currentCount = parseInt(countSpan.textContent.match(/\d+/)[0]) || 0;
            countSpan.textContent = `👥 Зарегистрировано: ${currentCount + 1}`;
          }

          // Replace button
          button.remove();
          const unregisterBtn = document.createElement('button');
          unregisterBtn.className = 'btn btn-secondary btn-small event-unregister-btn';
          unregisterBtn.setAttribute('data-event-id', eventId);
          unregisterBtn.style.backgroundColor = '#dc3545';
          unregisterBtn.style.borderColor = '#dc3545';
          unregisterBtn.textContent = 'Отменить регистрацию';
          unregisterBtn.addEventListener('click', handleUnregister);
          actionsDiv.appendChild(unregisterBtn);

          // Show success message
          showNotification('Вы успешно зарегистрированы на мероприятие!', 'success');
        } else {
          showNotification(data.error || 'Ошибка при регистрации', 'error');
          button.disabled = false;
          button.textContent = 'Зарегистрироваться';
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification('Ошибка при регистрации на мероприятие', 'error');
        button.disabled = false;
        button.textContent = 'Зарегистрироваться';
      }
    });
  });

  const handleUnregister = async function() {
    const eventId = this.getAttribute('data-event-id');
    const button = this;
    
    // Disable button during request
    button.disabled = true;
    button.textContent = 'Отмена...';

    try {
      const response = await fetch(`/events/${eventId}/unregister`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Update UI
        const eventItem = button.closest('.event-item');
        const actionsDiv = button.closest('.event-registration-actions');
        
        // Update registration count
        const countSpan = eventItem.querySelector('.registration-count');
        if (countSpan) {
          const currentCount = parseInt(countSpan.textContent.match(/\d+/)[0]) || 0;
          countSpan.textContent = `👥 Зарегистрировано: ${Math.max(0, currentCount - 1)}`;
        }

        // Replace button
        button.remove();
        const registerBtn = document.createElement('button');
        registerBtn.className = 'btn btn-primary btn-small event-register-btn';
        registerBtn.setAttribute('data-event-id', eventId);
        registerBtn.textContent = 'Зарегистрироваться';
        registerBtn.addEventListener('click', function() {
          const eventId = this.getAttribute('data-event-id');
          const button = this;
          
          button.disabled = true;
          button.textContent = 'Регистрация...';

          fetch(`/events/${eventId}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              const eventItem = button.closest('.event-item');
              const countSpan = eventItem.querySelector('.registration-count');
              if (countSpan) {
                const currentCount = parseInt(countSpan.textContent.match(/\d+/)[0]) || 0;
                countSpan.textContent = `👥 Зарегистрировано: ${currentCount + 1}`;
              }
              button.remove();
              const unregisterBtn = document.createElement('button');
              unregisterBtn.className = 'btn btn-secondary btn-small event-unregister-btn';
              unregisterBtn.setAttribute('data-event-id', eventId);
              unregisterBtn.style.backgroundColor = '#dc3545';
              unregisterBtn.style.borderColor = '#dc3545';
              unregisterBtn.textContent = 'Отменить регистрацию';
              unregisterBtn.addEventListener('click', handleUnregister);
              actionsDiv.appendChild(unregisterBtn);
              showNotification('Вы успешно зарегистрированы на мероприятие!', 'success');
            } else {
              showNotification(data.error || 'Ошибка при регистрации', 'error');
              button.disabled = false;
              button.textContent = 'Зарегистрироваться';
            }
          })
          .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка при регистрации на мероприятие', 'error');
            button.disabled = false;
            button.textContent = 'Зарегистрироваться';
          });
        });
        actionsDiv.appendChild(registerBtn);

        // Show success message
        showNotification('Регистрация на мероприятие отменена', 'success');
      } else {
        showNotification(data.error || 'Ошибка при отмене регистрации', 'error');
        button.disabled = false;
        button.textContent = 'Отменить регистрацию';
      }
    } catch (error) {
      console.error('Error:', error);
      showNotification('Ошибка при отмене регистрации', 'error');
      button.disabled = false;
      button.textContent = 'Отменить регистрацию';
    }
  };

  unregisterButtons.forEach(button => {
    button.addEventListener('click', handleUnregister);
  });

  // Notification function
  function showNotification(message, type) {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background-color: ${type === 'success' ? '#28a745' : '#dc3545'};
      color: white;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Add CSS animations
  if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
});
