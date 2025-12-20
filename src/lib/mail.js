import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'oalali5@gmail.com',
        pass: 'ycdu auej nqtf flrk'
    }
});

/**
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.text
 * @param {string} [options.html]
 */
export async function sendEmail({ to, subject, text, html }) {
    try {
        const info = await transporter.sendMail({
            from: '"Colouriana" <oalali5@gmail.com>',
            to,
            subject,
            text,
            html
        });
        return info;
    } catch (err) {
        throw err;
    }
}
