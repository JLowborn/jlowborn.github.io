// The typewriter element
var typeWriterElement = document.getElementById('typewriter');

// The TextArray:
var textArray = [
	"Hack The Planet!",
	"Decrypting the secrets of the digital realm.",
	"Hacked! Just kidding, or am I?",
	"Hope your firewall works.",
	"Code is poetry; let’s write a masterpiece.",
	"Let the games begin.",
	"Just another day in the code mines.",
	"Let's exploit some vulnerabilities, shall we?",
	"Loading exploits, prepare for chaos.",
	"Infiltration successful. Proceeding with the mission."
];

// Function to generate the backspace effect 
function delWriter(text, i, cb) {
    if (i >= 0) {
        typeWriterElement.innerHTML = text.substring(0, i--);
        var rndBack = 10 + Math.random() * 100;
        setTimeout(function() {
            delWriter(text, i, cb);
        }, rndBack);
    } else if (typeof cb == 'function') {
        setTimeout(cb, 300);
    }
};

// Function to generate the key hitting effect
function typeWriter(text, i, cb) {
    if (i < text.length + 1) {
        typeWriterElement.innerHTML = text.substring(0, i++);
        var rndTyping = 100 - Math.random() * 50;
        setTimeout(function() {
            typeWriter(text, i, cb);
        }, rndTyping);
    } else if (i === text.length + 1) {
        setTimeout(function() {
            delWriter(text, i, cb);
        }, 1000);
    }
};

// Function to get a random message from the textArray
function getRandomMessage() {
    return textArray[Math.floor(Math.random() * textArray.length)];
}

// The main writer function
function StartWriter() {
    var randomIndex = Math.floor(Math.random() * textArray.length);
    var message = textArray[randomIndex];
    typeWriter(message, 0, function() {
        setTimeout(StartWriter, 300); // Wait before starting again
    });
};

// Wait one second then start the typewriter
setTimeout(StartWriter, 300);
